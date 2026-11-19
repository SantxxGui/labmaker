/** CONTROLLER — Monitoramento de máquinas: telemetria, alarmes e comandos remotos */
import "server-only";
import { ApiError, autorizar, handler, ipDe, json } from "@/lib/api";
import { COMANDO_LABEL } from "@/lib/labels";
import { avaliarComando, lerTelemetria, serieRecente } from "@/lib/telemetria";
import { comandoSchema } from "@/lib/validators";
import { AlarmeModel, ComandoModel } from "@/models/alarme.model";
import { AuditoriaModel } from "@/models/auditoria.model";
import { EquipamentoModel } from "@/models/equipamento.model";

type Ctx = { params: Promise<{ id: string }> };

export const MaquinaController = {
  /** GET /api/maquinas/telemetria — leitura instantânea de todas as máquinas (polling do painel) */
  telemetria: handler(async () => {
    await autorizar("maquina:monitorar");
    const agora = new Date();
    const maquinas = await EquipamentoModel.paraTelemetria();
    return json({ leituras: maquinas.map((m) => lerTelemetria(m, agora)) }, { headers: { "Cache-Control": "no-store" } });
  }),

  /** GET /api/equipamentos/:id/telemetria?serie=1 — leitura de uma máquina, com série recente opcional */
  telemetriaEquipamento: handler(async (req: Request, ctx: Ctx) => {
    await autorizar("maquina:monitorar");
    const { id } = await ctx.params;
    const [m] = await EquipamentoModel.paraTelemetria(id);
    if (!m) throw new ApiError(404, "Equipamento não encontrado.");
    const agora = new Date();
    const comSerie = new URL(req.url).searchParams.get("serie") === "1";
    return json(
      { leitura: lerTelemetria(m, agora), ...(comSerie ? { serie: serieRecente(m, agora) } : {}) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),

  /** GET /api/alarmes — alarmes ativos de todas as máquinas */
  alarmesAtivos: handler(async () => {
    await autorizar("maquina:monitorar");
    return json({ alarmes: await AlarmeModel.ativos() });
  }),

  /** GET /api/equipamentos/:id/alarmes — ativos + histórico */
  alarmes: handler(async (_req: Request, ctx: Ctx) => {
    await autorizar("maquina:monitorar");
    const { id } = await ctx.params;
    const [ativos, historico] = await Promise.all([AlarmeModel.ativos(id), AlarmeModel.historico(id)]);
    return json({ ativos, historico });
  }),

  /** GET /api/equipamentos/:id/comandos — histórico de comandos */
  comandos: handler(async (_req: Request, ctx: Ctx) => {
    await autorizar("maquina:monitorar");
    const { id } = await ctx.params;
    return json({ comandos: await ComandoModel.listar(id) });
  }),

  /**
   * POST /api/equipamentos/:id/comandos — envia um comando à máquina.
   * Todo comando fica registrado, inclusive os recusados (409).
   */
  comandar: handler(async (req: Request, ctx: Ctx) => {
    const s = await autorizar("maquina:comandar");
    const { id } = await ctx.params;
    const { tipo, justificativa } = comandoSchema.parse(await req.json());

    const e = await EquipamentoModel.buscarParaComando(id);
    if (!e) throw new ApiError(404, "Equipamento não encontrado.");

    const avaliacao = avaliarComando({
      tipo, status: e.status, estado: e.estadoMaquina,
      alarmes: e.alarmes.map((a) => ({ severidade: a.severidade, reconhecido: !!a.reconhecidoEm })),
    });

    const comando = await ComandoModel.registrar({
      equipamentoId: id, usuarioId: s.sub, tipo, status: avaliacao.ok ? "EXECUTADO" : "REJEITADO",
      motivo: avaliacao.ok ? null : avaliacao.motivo, justificativa: justificativa || null,
    });

    if (!avaliacao.ok) {
      await AuditoriaModel.registrar({
        autor: s, acao: "maquina.comando_rejeitado", entidade: "equipamento", entidadeId: id, ip: ipDe(req),
        resumo: `${COMANDO_LABEL[tipo]} → ${e.nome}: ${avaliacao.motivo}`, dados: { tipo },
      });
      throw new ApiError(409, avaliacao.motivo);
    }

    // Em produção: o gateway entrega o comando ao CLP/CNC e confirma. No simulador, aplicamos o efeito.
    let reconhecidos = 0;
    if (avaliacao.reconhecerAlarmes) reconhecidos = await AlarmeModel.reconhecerPendentes(id, s.sub);
    if (avaliacao.novoEstado !== e.estadoMaquina) await EquipamentoModel.atualizarEstado(id, avaliacao.novoEstado);

    await AuditoriaModel.registrar({
      autor: s, entidade: "equipamento", entidadeId: id, ip: ipDe(req),
      acao: tipo === "RECONHECER_ALARMES" ? "maquina.alarmes_reconhecidos" : "maquina.comando",
      resumo: tipo === "RECONHECER_ALARMES"
        ? `Reconheceu ${reconhecidos} alarme(s) em ${e.nome}`
        : `${COMANDO_LABEL[tipo]} → ${e.nome}${justificativa ? ` (${justificativa})` : ""}`,
      dados: { tipo, de: e.estadoMaquina, para: avaliacao.novoEstado },
    });

    const [m] = await EquipamentoModel.paraTelemetria(id);
    return json({ comando, leitura: lerTelemetria(m) }, 201);
  }),
};
