/** CONTROLLER — Atendimento: fila de pedidos de ajuda, chat e tela pelo chamado */
import "server-only";
import { ApiError, autorizar, handler, ipDe, json } from "@/lib/api";
import { parametroTelaDoChamado, transicaoChamado } from "@/lib/chamados";
import { notificarAparelho } from "@/lib/push";
import { chamadoMensagemSchema } from "@/lib/validators";
import { AuditoriaModel } from "@/models/auditoria.model";
import { ChamadoModel } from "@/models/chamado.model";
import { AcaoDispositivoModel, DispositivoModel } from "@/models/dispositivo.model";

type Ctx = { params: Promise<{ id: string }> };

async function chamadoOu404(id: string) {
  const c = await ChamadoModel.buscar(id);
  if (!c) throw new ApiError(404, "Chamado não encontrado.");
  return c;
}

export const ChamadoController = {
  /** GET /api/chamados — fila do atendimento */
  fila: handler(async () => {
    await autorizar("dispositivo:comandar");
    return json({ chamados: await ChamadoModel.fila() }, { headers: { "Cache-Control": "no-store" } });
  }),

  /** GET /api/chamados/contagem — para o selo no menu */
  contagem: handler(async () => {
    await autorizar("dispositivo:comandar");
    return json({ abertos: await ChamadoModel.contarAbertos() }, { headers: { "Cache-Control": "no-store" } });
  }),

  /** GET /api/chamados/:id — chamado com a conversa inteira */
  buscar: handler(async (_req: Request, ctx: Ctx) => {
    await autorizar("dispositivo:comandar");
    return json({ chamado: await chamadoOu404((await ctx.params).id) }, { headers: { "Cache-Control": "no-store" } });
  }),

  /** POST /api/chamados/:id/atender */
  atender: handler(async (req: Request, ctx: Ctx) => {
    const s = await autorizar("dispositivo:comandar");
    const c = await chamadoOu404((await ctx.params).id);
    const t = transicaoChamado(c.status, "atender");
    if (!t.ok) throw new ApiError(409, t.motivo);
    await ChamadoModel.mudarStatus(c.id, t.status, s.sub);
    await ChamadoModel.mensagem(c.id, "SISTEMA", null, `${s.nome.split(" ")[0]} (Líder do espaço) está atendendo o seu pedido.`);
    await AuditoriaModel.registrar({ autor: s, acao: "chamado.atendido", entidade: "chamado", entidadeId: c.id, ip: ipDe(req), resumo: `Atendeu o pedido de ajuda #${c.numero} de ${c.dispositivo.hostname}` });
    void notificarAparelho(c.dispositivo.id, { titulo: "Pedido de ajuda em atendimento", corpo: `${s.nome.split(" ")[0]} está atendendo você.`, tag: `chamado-${c.id}` });
    return json({ chamado: await chamadoOu404(c.id) });
  }),

  /** POST /api/chamados/:id/resolver */
  resolver: handler(async (req: Request, ctx: Ctx) => {
    const s = await autorizar("dispositivo:comandar");
    const c = await chamadoOu404((await ctx.params).id);
    const t = transicaoChamado(c.status, "resolver");
    if (!t.ok) throw new ApiError(409, t.motivo);
    await ChamadoModel.mensagem(c.id, "SISTEMA", null, "Atendimento encerrado. Se precisar, peça ajuda de novo.");
    await ChamadoModel.mudarStatus(c.id, t.status, c.atendidoPor ? undefined : s.sub);
    await AuditoriaModel.registrar({ autor: s, acao: "chamado.resolvido", entidade: "chamado", entidadeId: c.id, ip: ipDe(req), resumo: `Encerrou o pedido de ajuda #${c.numero} de ${c.dispositivo.hostname}` });
    return json({ ok: true });
  }),

  /** POST /api/chamados/:id/mensagens — o Líder escreve no chat (chega no próximo check-in, ~3 s) */
  mensagem: handler(async (req: Request, ctx: Ctx) => {
    const s = await autorizar("dispositivo:comandar");
    const c = await chamadoOu404((await ctx.params).id);
    if (c.status === "RESOLVIDO" || c.status === "CANCELADO") throw new ApiError(409, "Este chamado já foi encerrado.");
    const { texto } = chamadoMensagemSchema.parse(await req.json());
    if (c.status === "ABERTO") {
      await ChamadoModel.mudarStatus(c.id, "EM_ATENDIMENTO", s.sub); // responder já é atender
      await AuditoriaModel.registrar({ autor: s, acao: "chamado.atendido", entidade: "chamado", entidadeId: c.id, ip: ipDe(req), resumo: `Atendeu o pedido de ajuda #${c.numero} de ${c.dispositivo.hostname}` });
    }
    const m = await ChamadoModel.mensagem(c.id, "LIDER", s.nome, texto);
    void notificarAparelho(c.dispositivo.id, { titulo: `Líder: ${s.nome.split(" ")[0]}`, corpo: texto.slice(0, 140), tag: `chamado-${c.id}` });
    return json({ mensagem: m }, 201);
  }),

  /**
   * POST /api/chamados/:id/tela — ver a tela de quem pediu ajuda.
   * Se a pessoa marcou "o Líder pode ver minha tela" ao pedir, o agente não pergunta de novo
   * (mas o aviso de "tela sendo vista" aparece do mesmo jeito). Senão, abre a janela Permitir/Recusar.
   */
  verTela: handler(async (req: Request, ctx: Ctx) => {
    const s = await autorizar("dispositivo:comandar");
    const c = await chamadoOu404((await ctx.params).id);
    if (c.status === "RESOLVIDO" || c.status === "CANCELADO") throw new ApiError(409, "Este chamado já foi encerrado.");
    if (!c.dispositivo.agenteReal || c.dispositivo.tipo === "SMARTPHONE" || c.dispositivo.tipo === "TABLET") throw new ApiError(422, "Ver a tela só funciona em computadores com o agente instalado.");
    if (!c.dispositivo.online) throw new ApiError(409, "O computador está offline.");
    if (c.status === "ABERTO") await ChamadoModel.mudarStatus(c.id, "EM_ATENDIMENTO", s.sub);
    const acao = await AcaoDispositivoModel.registrar({
      dispositivoId: c.dispositivo.id, usuarioId: s.sub, tipo: "SESSAO_REMOTA",
      justificativa: `Pedido de ajuda #${c.numero}: ${c.descricao}`.slice(0, 300),
      parametro: parametroTelaDoChamado(c.id, c.autorizaTela),
    });
    await ChamadoModel.mensagem(c.id, "SISTEMA", null, c.autorizaTela ? "O Líder está abrindo a sua tela (você autorizou ao pedir ajuda)." : "O Líder pediu para ver a sua tela. Responda na janela que abriu.");
    await AuditoriaModel.registrar({
      autor: s, acao: "dispositivo.acao", entidade: "dispositivo", entidadeId: c.dispositivo.id, ip: ipDe(req),
      resumo: `Pediu para ver a tela de ${c.dispositivo.hostname} pelo chamado #${c.numero}${c.autorizaTela ? " (pré-autorizado pelo usuário)" : ""}`,
    });
    return json({ acaoId: acao.id, preAutorizado: c.autorizaTela }, 201);
  }),

  /** POST /api/dispositivos/:id/atendimento — o Líder puxa conversa com um aparelho (abre um chamado já em atendimento) */
  iniciar: handler(async (req: Request, ctx: Ctx) => {
    const s = await autorizar("dispositivo:comandar");
    const { id } = await ctx.params;
    const d = await DispositivoModel.buscar(id);
    if (!d) throw new ApiError(404, "Dispositivo não encontrado.");
    const aberto = await ChamadoModel.aberto(id);
    if (aberto) return json({ chamado: { id: aberto.id, numero: aberto.numero, status: aberto.status } });
    const c = await ChamadoModel.criar({ dispositivoId: id, descricao: "Atendimento iniciado pelo Líder", nomeSolicitante: null, autorizaTela: false, status: "EM_ATENDIMENTO", atendidoPorId: s.sub });
    await AuditoriaModel.registrar({ autor: s, acao: "chamado.aberto", entidade: "chamado", entidadeId: c.id, ip: ipDe(req), resumo: `Iniciou um atendimento com ${d.hostname} (#${c.numero})` });
    return json({ chamado: { id: c.id, numero: c.numero, status: c.status } }, 201);
  }),
};
