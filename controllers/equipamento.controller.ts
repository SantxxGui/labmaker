/** CONTROLLER — Equipamentos */
import "server-only";
import { ApiError, autorizar, handler, ipDe, json } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/labels";
import { bloqueadoPorCalibracao, gerarSlots, isDataValida, motivoDataBloqueada, situacaoCalibracao } from "@/lib/slots";
import type { DisponibilidadeDTO } from "@/lib/types";
import { equipamentoCreateSchema, equipamentoPatchSchema } from "@/lib/validators";
import { AgendamentoModel } from "@/models/agendamento.model";
import { AuditoriaModel } from "@/models/auditoria.model";
import { EquipamentoModel } from "@/models/equipamento.model";
import { LaboratorioModel } from "@/models/laboratorio.model";

type Ctx = { params: Promise<{ id: string }> };

export const EquipamentoController = {
  /** GET /api/equipamentos?laboratorioId= */
  listar: handler(async (req: Request) => {
    await autorizar("equipamento:ver");
    const laboratorioId = new URL(req.url).searchParams.get("laboratorioId") ?? undefined;
    return json({ equipamentos: await EquipamentoModel.listarAtivos(laboratorioId) });
  }),

  /** POST /api/equipamentos */
  criar: handler(async (req: Request) => {
    const s = await autorizar("equipamento:gerenciar");
    const d = equipamentoCreateSchema.parse(await req.json());

    if (!(await LaboratorioModel.buscarPorId(d.laboratorioId))) throw new ApiError(404, "Laboratório não encontrado.");
    if (d.patrimonio && (await EquipamentoModel.buscarPorPatrimonio(d.patrimonio))) {
      throw new ApiError(409, "Já existe um equipamento com este número de patrimônio.");
    }
    if (d.enderecoIp && (await EquipamentoModel.buscarPorIp(d.enderecoIp))) {
      throw new ApiError(409, "Este endereço IP já está em uso por outro equipamento.");
    }
    if (d.requerCalibracao && !d.intervaloCalibracaoDias) {
      throw new ApiError(422, "Informe o intervalo de calibração em dias.");
    }

    const equipamento = await EquipamentoModel.criar({
      nome: d.nome, tipo: d.tipo, laboratorioId: d.laboratorioId,
      fabricante: d.fabricante || null, modelo: d.modelo || null, patrimonio: d.patrimonio || null,
      localizacao: d.localizacao || null, criticidade: d.criticidade, duracaoSlotMinutos: d.duracaoSlotMinutos,
      requerCalibracao: d.requerCalibracao,
      intervaloCalibracaoDias: d.requerCalibracao ? (d.intervaloCalibracaoDias ?? null) : null,
      enderecoIp: d.enderecoIp || null,
    });
    await AuditoriaModel.registrar({
      autor: s, acao: "equipamento.criado", entidade: "equipamento", entidadeId: equipamento.id,
      resumo: `Cadastrou ${equipamento.nome} em ${equipamento.laboratorio.codigo}`, ip: ipDe(req),
    });
    return json({ equipamento }, 201);
  }),

  /** PATCH /api/equipamentos/:id — inclui a alteração rápida de status */
  atualizar: handler(async (req: Request, ctx: Ctx) => {
    const dados = equipamentoPatchSchema.parse(await req.json());
    // Só status → basta "alterar_status"; demais campos exigem "gerenciar"
    const soStatus = Object.keys(dados).every((k) => k === "status");
    const s = await autorizar(soStatus ? "equipamento:alterar_status" : "equipamento:gerenciar");
    const { id } = await ctx.params;

    const atual = await EquipamentoModel.buscarAtivo(id);
    if (!atual) throw new ApiError(404, "Equipamento não encontrado.");

    const equipamento = await EquipamentoModel.atualizar(id, dados);
    const mudouStatus = dados.status && dados.status !== atual.status;
    await AuditoriaModel.registrar({
      autor: s, entidade: "equipamento", entidadeId: id, ip: ipDe(req),
      acao: mudouStatus ? "equipamento.status_alterado" : "equipamento.atualizado",
      resumo: mudouStatus
        ? `${atual.nome}: ${STATUS_LABEL[atual.status]} → ${STATUS_LABEL[dados.status!]}`
        : `Atualizou ${atual.nome}`,
      dados: mudouStatus ? { de: atual.status, para: dados.status } : dados,
    });
    return json({ equipamento });
  }),

  /** DELETE /api/equipamentos/:id — soft delete + cancela reservas futuras */
  remover: handler(async (req: Request, ctx: Ctx) => {
    const s = await autorizar("equipamento:gerenciar");
    const { id } = await ctx.params;
    const atual = await EquipamentoModel.buscarAtivo(id);
    if (!atual) throw new ApiError(404, "Equipamento não encontrado.");

    const reservasCanceladas = await EquipamentoModel.desativar(id);
    await AuditoriaModel.registrar({
      autor: s, acao: "equipamento.removido", entidade: "equipamento", entidadeId: id, ip: ipDe(req),
      resumo: `Removeu ${atual.nome} (${reservasCanceladas} reserva(s) cancelada(s))`,
      dados: { reservasCanceladas },
    });
    return json({ ok: true, reservasCanceladas });
  }),

  /** GET /api/equipamentos/:id/disponibilidade?data=YYYY-MM-DD */
  disponibilidade: handler(async (req: Request, ctx: Ctx) => {
    const s = await autorizar("equipamento:ver");
    const { id } = await ctx.params;
    const data = new URL(req.url).searchParams.get("data") ?? "";
    if (!isDataValida(data)) throw new ApiError(400, "Parâmetro ?data=YYYY-MM-DD inválido.");

    const e = await EquipamentoModel.buscarAtivo(id);
    if (!e) throw new ApiError(404, "Equipamento não encontrado.");

    const base = { data, equipamento: { id: e.id, nome: e.nome, status: e.status, duracaoSlotMinutos: e.duracaoSlotMinutos } };
    const bloqueio = (motivo: string) => json<DisponibilidadeDTO>({ ...base, bloqueado: true, motivo, slots: [] });

    // Regras de bloqueio, da mais específica para a mais geral
    if (e.status === "MANUTENCAO") return bloqueio("Equipamento em manutenção. Reservas suspensas até a liberação técnica.");
    if (bloqueadoPorCalibracao(situacaoCalibracao(e))) {
      return bloqueio("Calibração vencida. O equipamento só volta a aceitar reservas após nova calibração.");
    }
    const motivoData = motivoDataBloqueada(data);
    if (motivoData) return bloqueio(motivoData);

    const ocupados = await AgendamentoModel.ocupadosNoDia(id, data);
    const slots = gerarSlots({ data, duracaoMin: e.duracaoSlotMinutos, ocupados, usuarioId: s.sub });
    return json<DisponibilidadeDTO>({ ...base, bloqueado: false, motivo: null, slots }, { headers: { "Cache-Control": "no-store" } });
  }),
};
