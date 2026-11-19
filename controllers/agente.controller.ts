/**
 * CONTROLLER — Agente real dos notebooks.
 *
 * Fluxo:
 *  1. O Líder gera um código de inscrição (POST /api/dispositivos/inscricao) — vale 2 h.
 *  2. No computador, o agente envia o código + dados do aparelho (POST /api/agente/inscrever)
 *     e recebe um TOKEN próprio. O banco guarda só o SHA-256 do token.
 *  3. A cada 15 s o agente faz check-in (POST /api/agente/checkin, cabeçalho Authorization: Bearer <token>):
 *     manda telemetria, eventos e resultados; recebe a política e as ações pendentes.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { INTERVALO_CHECKIN_S, efeitoAcao, eventoDaAcao } from "@/lib/agente";
import { ApiError, autorizar, handler, ipDe, json } from "@/lib/api";
import { assinarInscricao, verificarInscricao } from "@/lib/session";
import { automacoesDoCheckin } from "@/lib/automacao";
import { CHECKIN_ATENDIMENTO_S } from "@/lib/chamados";
import { chavesVapid } from "@/lib/push";
import { INTERVALO_QUADRO_MS, TAMANHO_MAX_BYTES, TelaStore, avaliarQuadro } from "@/lib/tela-remota";
import { ChamadoModel } from "@/models/chamado.model";
import { agenteChamadoSchema, agenteCheckinSchema, agenteInscreverSchema, agenteMensagemSchema, agentePushSchema, inscricaoSchema, telaQuadroSchema } from "@/lib/validators";
import { AgenteModel } from "@/models/agente.model";
import { AuditoriaModel } from "@/models/auditoria.model";
import { DispositivoModel } from "@/models/dispositivo.model";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Lê "Authorization: Bearer lmk_…" e devolve o dispositivo dono do token. */
async function dispositivoDoToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token.startsWith("lmk_")) throw new ApiError(401, "Token do agente ausente ou inválido.");
  const d = await AgenteModel.porToken(sha256(token));
  if (!d || !d.ativo) throw new ApiError(401, "Token do agente ausente ou inválido.");
  return d;
}

export const AgenteController = {
  /** POST /api/dispositivos/inscricao — gera o código para instalar o agente num computador */
  gerarInscricao: handler(async (req: Request) => {
    const s = await autorizar("dispositivo:cadastrar");
    const { politicaId = null, laboratorioId = null } = inscricaoSchema.parse(await req.json().catch(() => ({})));
    const codigo = await assinarInscricao({ politicaId, laboratorioId, por: s.sub });
    await AuditoriaModel.registrar({
      autor: s, acao: "dispositivo.inscricao_gerada", entidade: "dispositivo", entidadeId: null, ip: ipDe(req),
      resumo: "Gerou um código de inscrição de computador (válido por 2 h)",
    });
    return json({ codigo, validoAte: new Date(Date.now() + 2 * 3_600_000).toISOString() }, 201);
  }),

  /** POST /api/agente/inscrever — o agente troca o código por um token próprio */
  inscrever: handler(async (req: Request) => {
    const dados = agenteInscreverSchema.parse(await req.json());
    const convite = await verificarInscricao(dados.codigo);
    if (!convite) throw new ApiError(401, "Código de inscrição inválido ou expirado. Gere outro na tela de Notebooks.");

    const token = `lmk_${randomBytes(24).toString("base64url")}`;
    const { codigo: _c, ...aparelho } = dados;
    const d = await AgenteModel.inscrever(
      { ...aparelho, enderecoIp: ipDe(req), enderecoMac: dados.enderecoMac ?? null, politicaId: convite.politicaId, laboratorioId: convite.laboratorioId },
      sha256(token),
    );
    await AuditoriaModel.registrar({
      autor: null, acao: "dispositivo.inscrito", entidade: "dispositivo", entidadeId: d.id, ip: ipDe(req),
      resumo: `Agente real inscrito em ${d.hostname}`,
    });
    // O token aparece UMA vez, só para o agente. Depois disso o servidor só conhece o hash.
    return json({ dispositivoId: d.id, hostname: d.hostname, token, intervaloSeg: INTERVALO_CHECKIN_S }, 201);
  }),

  /** POST /api/agente/checkin — telemetria e resultados sobem; política e ações pendentes descem */
  checkin: handler(async (req: Request) => {
    const d = await dispositivoDoToken(req);
    const c = agenteCheckinSchema.parse(await req.json());

    const t = c.telemetria;
    const telemetria = {
      cpu: t.cpu ?? null, memoria: t.memoria ?? null, disco: t.disco ?? null, bateria: t.bateria ?? null, carregando: t.carregando,
      rede: t.rede ?? null, usuarioSessao: t.usuarioSessao ?? null, appAtivo: t.appAtivo ?? null, uptimeH: t.uptimeH ?? null,
      segurancaInformada: Object.entries(c.seguranca ?? {}).filter(([, v]) => v !== undefined && v !== null).map(([k]) => k),
    };
    await AgenteModel.registrarCheckin(d.id, { telemetria, enderecoIp: ipDe(req), versaoSo: c.versaoSo, agenteVersao: c.agenteVersao, seguranca: c.seguranca });
    await AgenteModel.registrarEventos(d.id, c.eventos);

    // Resultados das ações recebidas no check-in anterior: aplica o efeito só quando o agente confirma
    for (const r of c.resultados) {
      const acao = await AgenteModel.concluirAcao(d.id, r.id, r.status, r.motivo ?? null);
      if (!acao || r.status !== "EXECUTADA") continue;
      const estado = await AgenteModel.buscarEstado(d.id);
      if (estado) {
        const efeito = efeitoAcao(acao.tipo, estado, acao.parametro);
        if (Object.keys(efeito).length) await DispositivoModel.atualizar(d.id, efeito);
      }
      const ev = eventoDaAcao(acao.tipo, acao.parametro);
      if (ev) await AgenteModel.registrarEventos(d.id, [ev]);
    }

    // Automações (lembrete de devolução, atraso, fechamento/abertura): o próprio check-in é o relógio
    const estadoAgora = c.resultados.length ? await AgenteModel.buscarEstado(d.id) : null;
    const bloqueadoAgora = estadoAgora?.bloqueado ?? d.bloqueado;
    const ctxAuto = await AgenteModel.contextoAutomacao(d.id);
    const automaticas = automacoesDoCheckin({
      agora: new Date(), dispositivo: { hostname: d.hostname, tipo: d.tipo, bloqueado: bloqueadoAgora },
      politica: d.politica, ...ctxAuto,
    });
    for (const a of automaticas) {
      const { resumo, ...acao } = a;
      if (!(await AgenteModel.criarAcaoSistema(d.id, acao))) continue; // o agendador já criou
      await AuditoriaModel.registrar({ autor: null, acao: "dispositivo.automacao", entidade: "dispositivo", entidadeId: d.id, ip: null, resumo });
    }

    const acoes = await AgenteModel.entregarPendentes(d.id);

    // Atendimento: mensagens novas do Líder e check-in rápido enquanto houver chamado aberto
    const chamado = await ChamadoModel.aberto(d.id);
    const mensagens = chamado ? await ChamadoModel.entregar(chamado.id) : [];
    return json(
      {
        intervaloSeg: chamado ? CHECKIN_ATENDIMENTO_S : INTERVALO_CHECKIN_S,
        politica: d.politica, bloqueado: bloqueadoAgora, acoes,
        chamado: chamado && { id: chamado.id, numero: chamado.numero, status: chamado.status, descricao: chamado.descricao, atendente: chamado.atendidoPor?.nome ?? null },
        mensagens,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),

  /**
   * POST /api/agente/tela — o agente envia um quadro da tela (depois que o USUÁRIO autorizou).
   * Responde { continuar } para o agente saber se segue transmitindo.
   */
  tela: handler(async (req: Request) => {
    const d = await dispositivoDoToken(req);
    const q = telaQuadroSchema.parse(await req.json());
    const sessao = TelaStore.buscar(d.id);

    if (q.fim) {
      if (sessao?.acaoId === q.acaoId && TelaStore.encerrar(d.id, "Encerrada pelo usuário no computador.")) {
        await AuditoriaModel.registrar({
          autor: null, acao: "dispositivo.tela_encerrada", entidade: "dispositivo", entidadeId: d.id, ip: ipDe(req),
          resumo: `O usuário de ${d.hostname} encerrou o compartilhamento de tela`,
        });
      }
      return json({ continuar: false });
    }

    const regra = avaliarQuadro(await AgenteModel.buscarAcao(d.id, q.acaoId), d.id, sessao);
    if (!regra.ok) {
      if (sessao?.acaoId === q.acaoId && TelaStore.encerrar(d.id, regra.motivo)) {
        await AuditoriaModel.registrar({
          autor: null, acao: "dispositivo.tela_encerrada", entidade: "dispositivo", entidadeId: d.id, ip: ipDe(req),
          resumo: `Compartilhamento de tela de ${d.hostname} encerrado: ${regra.motivo}`,
        });
      }
      return json({ continuar: false, motivo: regra.motivo });
    }

    if (q.mesmo && !regra.nova) {
      TelaStore.manterVivo(d.id);
      return json({ continuar: true, intervaloMs: INTERVALO_QUADRO_MS }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!q.imagem) throw new ApiError(422, "O primeiro quadro precisa da imagem.");
    const dados = Buffer.from(q.imagem, "base64");
    if (dados.length > TAMANHO_MAX_BYTES) throw new ApiError(413, "Quadro grande demais (máx. 3 MB).");
    if (regra.nova) {
      TelaStore.iniciar(q.acaoId, d.id);
      await AuditoriaModel.registrar({
        autor: null, acao: "dispositivo.tela_iniciada", entidade: "dispositivo", entidadeId: d.id, ip: ipDe(req),
        resumo: `O usuário de ${d.hostname} autorizou e começou a compartilhar a tela`,
      });
    }
    TelaStore.gravarQuadro(d.id, dados, q.tipo);
    return json({ continuar: true, intervaloMs: INTERVALO_QUADRO_MS }, { headers: { "Cache-Control": "no-store" } });
  }),

  /** POST /api/agente/chamados — o usuário do aparelho pede ajuda ao Líder */
  abrirChamado: handler(async (req: Request) => {
    const d = await dispositivoDoToken(req);
    const b = agenteChamadoSchema.parse(await req.json());
    const existente = await ChamadoModel.aberto(d.id);
    if (existente) {
      // já tem um aberto: a nova descrição entra como mensagem, sem duplicar a fila
      await ChamadoModel.mensagem(existente.id, "USUARIO", b.nome ?? null, b.descricao);
      return json({ chamado: { id: existente.id, numero: existente.numero, status: existente.status }, jaExistia: true });
    }
    let chamado;
    try {
      chamado = await ChamadoModel.criar({ dispositivoId: d.id, descricao: b.descricao, nomeSolicitante: b.nome ?? null, autorizaTela: b.autorizaTela });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") throw new ApiError(409, "Já existe um pedido de ajuda aberto neste aparelho.");
      throw e;
    }
    await AuditoriaModel.registrar({
      autor: null, acao: "chamado.aberto", entidade: "chamado", entidadeId: chamado.id, ip: ipDe(req),
      resumo: `${b.nome ?? "Usuário"} pediu ajuda em ${d.hostname} (#${chamado.numero}): ${b.descricao.slice(0, 80)}${b.autorizaTela ? " · autorizou ver a tela" : ""}`,
    });
    return json({ chamado: { id: chamado.id, numero: chamado.numero, status: chamado.status } }, 201);
  }),

  /** POST /api/agente/chamados/mensagem — o usuário responde no chat do chamado aberto */
  mensagemChamado: handler(async (req: Request) => {
    const d = await dispositivoDoToken(req);
    const b = agenteMensagemSchema.parse(await req.json());
    const chamado = await ChamadoModel.aberto(d.id);
    if (!chamado) throw new ApiError(404, "Não há pedido de ajuda aberto neste aparelho.");
    return json({ mensagem: await ChamadoModel.mensagem(chamado.id, "USUARIO", b.nome ?? null, b.texto) }, 201);
  }),

  /** POST /api/agente/chamados/cancelar — o usuário resolveu sozinho */
  cancelarChamado: handler(async (req: Request) => {
    const d = await dispositivoDoToken(req);
    const chamado = await ChamadoModel.aberto(d.id);
    if (!chamado) return json({ ok: true });
    await ChamadoModel.mudarStatus(chamado.id, "CANCELADO");
    await AuditoriaModel.registrar({ autor: null, acao: "chamado.cancelado", entidade: "chamado", entidadeId: chamado.id, ip: ipDe(req), resumo: `O usuário de ${d.hostname} cancelou o pedido de ajuda #${chamado.numero}` });
    return json({ ok: true });
  }),

  /** GET /api/agente/push — chave pública VAPID (o navegador precisa dela para se inscrever) */
  chavePush: handler(async () => json({ chavePublica: (await chavesVapid()).publicKey })),

  /** POST /api/agente/push — guarda (ou apaga, com null) a inscrição Web Push deste aparelho */
  salvarPush: handler(async (req: Request) => {
    const d = await dispositivoDoToken(req);
    const { inscricao } = agentePushSchema.parse(await req.json());
    await AgenteModel.salvarPush(d.id, inscricao);
    return json({ ok: true });
  }),
};
