/** CONTROLLER — Agendamentos (reservas) */
import "server-only";
import { ApiError, autorizar, handler, ipDe, json } from "@/lib/api";
import { can } from "@/lib/permissions";
import { LAB, bloqueadoPorCalibracao, isInicioDeSlot, motivoDataBloqueada, situacaoCalibracao } from "@/lib/slots";
import { formatDataHora } from "@/lib/utils";
import { agendamentoCreateSchema } from "@/lib/validators";
import { AgendamentoModel } from "@/models/agendamento.model";
import { AuditoriaModel } from "@/models/auditoria.model";
import { EquipamentoModel } from "@/models/equipamento.model";

type Ctx = { params: Promise<{ id: string }> };

const ERROS_CRIACAO = {
  conflito: [409, "Esse horário acabou de ser reservado por outra pessoa."],
  conflito_proprio: [409, "Você já reservou esse horário."],
  limite: [429, `Limite de ${LAB.maxReservasAtivas} reservas ativas atingido. Cancele uma para liberar.`],
  choque_usuario: [409, "Você já tem outra reserva nesse mesmo horário."],
} as const;

export const AgendamentoController = {
  /** GET /api/agendamentos?escopo=minhas|todas */
  listar: handler(async (req: Request) => {
    const s = await autorizar();
    const todas = new URL(req.url).searchParams.get("escopo") === "todas";
    if (todas && !can(s.role, "reserva:ver_todas")) throw new ApiError(403, "Seu perfil não pode ver reservas de outros usuários.");
    return json({
      agendamentos: todas ? await AgendamentoModel.listarProximos() : await AgendamentoModel.listarDoUsuario(s.sub),
    });
  }),

  /** POST /api/agendamentos */
  criar: handler(async (req: Request) => {
    const s = await autorizar("reserva:criar");
    const { equipamentoId, inicio: inicioISO, finalidade } = agendamentoCreateSchema.parse(await req.json());
    const inicio = new Date(inicioISO);

    const e = await EquipamentoModel.buscarAtivo(equipamentoId);
    if (!e) throw new ApiError(404, "Equipamento não encontrado.");
    if (e.status === "MANUTENCAO") throw new ApiError(409, "Equipamento em manutenção — escolha outro.");
    if (bloqueadoPorCalibracao(situacaoCalibracao(e))) {
      throw new ApiError(409, "Equipamento com calibração vencida — reservas bloqueadas.");
    }

    const { valido, data } = isInicioDeSlot(inicio, e.duracaoSlotMinutos);
    if (!valido) throw new ApiError(422, "Horário fora da grade do laboratório.");
    const motivoData = motivoDataBloqueada(data);
    if (motivoData) throw new ApiError(422, motivoData);
    if (inicio <= new Date()) throw new ApiError(422, "Esse horário já passou.");

    const r = await AgendamentoModel.criarSemConflito({
      equipamentoId, usuarioId: s.sub, inicio,
      fim: new Date(inicio.getTime() + e.duracaoSlotMinutos * 60_000),
      limiteAtivas: s.role === "USUARIO" ? LAB.maxReservasAtivas : null,
      finalidade,
    });
    if (!r.ok) {
      const [status, msg] = ERROS_CRIACAO[r.motivo];
      throw new ApiError(status, msg);
    }

    await AuditoriaModel.registrar({
      autor: s, acao: "reserva.criada", entidade: "agendamento", entidadeId: r.agendamento.id, ip: ipDe(req),
      resumo: `Reservou ${e.nome} para ${formatDataHora(inicio)}`,
      dados: { equipamentoId, inicio: inicioISO, finalidade: finalidade ?? null },
    });
    return json({ agendamento: r.agendamento }, 201);
  }),

  /** DELETE /api/agendamentos/:id — cancelamento lógico; libera o horário */
  cancelar: handler(async (req: Request, ctx: Ctx) => {
    const s = await autorizar();
    const { id } = await ctx.params;

    const ag = await AgendamentoModel.buscarPorId(id);
    if (!ag) throw new ApiError(404, "Reserva não encontrada.");

    const dono = ag.usuarioId === s.sub;
    const gestor = can(s.role, "reserva:cancelar_qualquer");
    const agora = new Date();
    if (!dono && !gestor) throw new ApiError(403, "Você só pode cancelar suas próprias reservas.");
    if (ag.status !== "CONFIRMADO") throw new ApiError(409, "Esta reserva já foi encerrada.");
    if (!gestor && ag.inicio <= agora) throw new ApiError(422, "Só é possível cancelar antes do horário de início.");
    if (ag.fim <= agora) throw new ApiError(422, "Esta reserva já terminou.");

    await AgendamentoModel.cancelar(id);
    await AuditoriaModel.registrar({
      autor: s, acao: "reserva.cancelada", entidade: "agendamento", entidadeId: id, ip: ipDe(req),
      resumo: `Cancelou a reserva de ${ag.equipamento.nome} em ${formatDataHora(ag.inicio)}${dono ? "" : " (de outro usuário)"}`,
    });
    return json({ ok: true });
  }),
};
