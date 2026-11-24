/**
 * CONTROLLER — Agente real dos notebooks.
 *
 * Fluxo:
 *  1. O Líder gera um código de inscrição (POST /api/dispositivos/inscricao) — vale 2, 12 ou 24 h.
 *  2. No computador, o agente envia o código + dados do aparelho (POST /api/agente/inscrever)
 *     e recebe um TOKEN próprio. O banco guarda só o SHA-256 do token.
 *  3. A cada 15 s o agente faz check-in (POST /api/agente/checkin, cabeçalho Authorization: Bearer <token>):
 *     manda telemetria, eventos e resultados; recebe a política e as ações pendentes.
 */
import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { INTERVALO_CHECKIN_S, efeitoAcao, eventoDaAcao } from "@/lib/agente";
import { alarmeDevolucao } from "@/lib/emprestimo";

const CHECKIN_ALARME_S = 5;
import { ApiError, autorizar, handler, ipDe, json } from "@/lib/api";
import { assinarInscricao, assinarJanelaAjuda, verificarInscricao, verificarJanelaAjuda } from "@/lib/session";
import { automacoesDoCheckin } from "@/lib/automacao";
import { CHECKIN_ATENDIMENTO_S, DESCRICAO_ATALHO, JanelaAjuda } from "@/lib/chamados";
import { chavesVapid } from "@/lib/push";
import {
  ESPERA_CONTROLE_MS, INTERVALO_QUADRO_CONTROLE_MS, INTERVALO_QUADRO_MS, TAMANHO_MAX_BYTES, TelaStore, avaliarQuadro, controleEventos, estadoSessao,
  type EventoControle, type SessaoTela,
} from "@/lib/tela-remota";
import { ChamadoModel } from "@/models/chamado.model";
import { agenteChamadoSchema, agenteControleSchema, agenteJanelaEstadoSchema, agenteCheckinSchema, agenteInscreverSchema, agenteMensagemSchema, agentePushSchema, inscricaoSchema, telaQuadroSchema } from "@/lib/validators";
import { AgenteModel } from "@/models/agente.model";
import { ConviteModel, type Convite } from "@/models/convite.model";
import { TentativaLoginModel } from "@/models/tentativa-login.model";
import { OPCOES_PADRAO, VALIDADE_PADRAO_HORAS, comandosInstalacao, gerarCodigoCurto, normalizarCodigo, scriptErro, scriptPara, scriptUnix, scriptWindows, servidorSeguro } from "@/lib/convite";
import { avaliarTentativas } from "@/lib/limite-login";
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

/**
 * Quem fala no chat: o agente (token lmk_…) ou a janelinha de ajuda (chave de 12 h que só vale para o
 * chat daquele aparelho). Endpoints de telemetria e comandos continuam aceitando só o token do agente.
 */
async function aparelhoDoChat(req: Request): Promise<{ id: string; hostname: string }> {
  const auth = req.headers.get("authorization") ?? "";
  const chave = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (chave.startsWith("lmk_")) return dispositivoDoToken(req);
  const id = chave ? await verificarJanelaAjuda(chave) : null;
  const d = id ? await AgenteModel.porId(id) : null;
  if (!d || !d.ativo) throw new ApiError(401, "Esta janela venceu. Clique de novo em “Pedir ajuda ao Líder”.");
  return d;
}

/** O que o agente recebe a cada quadro: segue? com que intervalo? o Líder pediu/tem o controle? */
function respostaQuadro(s: SessaoTela | undefined) {
  return json(
    {
      continuar: true,
      intervaloMs: s?.controle === "ativo" ? INTERVALO_QUADRO_CONTROLE_MS : INTERVALO_QUADRO_MS,
      controle: s?.controle ?? "nenhum",
      controlePor: s?.controlePor ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Endereço público deste servidor, como o navegador do Líder o vê (Render: https://….onrender.com). */
function origemDe(req: Request) {
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || u.host;
  return `${proto}://${host}`;
}

/**
 * Código curto (K7P2QX) → convite guardado. Cada código errado conta no limite do IP (5 em 15 min),
 * então adivinhar um código de 6 letras (≈ 900 milhões de combinações) não é viável.
 * Um código longo (o JWT de antes) segue aceito e não passa por aqui.
 */
async function conviteDoCodigo(curto: string, ip: string | null): Promise<Convite | null> {
  const chave = `convite@${ip ?? "sem-ip"}`;
  const lim = avaliarTentativas(await TentativaLoginModel.contarFalhas(chave, null), new Date());
  if (lim.bloqueado) throw new ApiError(429, `Muitos códigos errados seguidos. Tente de novo em ${lim.esperaMin} min.`);
  const convite = await ConviteModel.buscar(curto);
  if (!convite) await TentativaLoginModel.registrar(chave, null, false);
  return convite;
}

export const AgenteController = {
  /** POST /api/dispositivos/inscricao — gera o código para instalar o agente num computador */
  gerarInscricao: handler(async (req: Request) => {
    const s = await autorizar("dispositivo:cadastrar");
    const corpo = inscricaoSchema.parse(await req.json().catch(() => ({})));
    const { politicaId = null, laboratorioId = null } = corpo;
    const servidor = servidorSeguro(corpo.servidor || origemDe(req));
    if (!servidor) throw new ApiError(422, "Endereço do servidor inválido. Use algo como https://seu-site.onrender.com ou http://192.168.0.10:3000.");
    const opcoes = { ...OPCOES_PADRAO, ...corpo.opcoes };
    const horas = corpo.validadeHoras ?? VALIDADE_PADRAO_HORAS;
    const expiraEm = new Date(Date.now() + horas * 3_600_000).toISOString();
    const jwt = await assinarInscricao({ politicaId, laboratorioId, por: s.sub }, horas);
    // código curto de 6 letras guardado no servidor; sorteia de novo no caso (raríssimo) de repetir
    let codigo = "";
    for (let i = 0; i < 5 && !codigo; i++) {
      const c = gerarCodigoCurto(randomInt);
      if (await ConviteModel.criar(c, { jwt, servidor, opcoes, expiraEm })) codigo = c;
    }
    if (!codigo) throw new ApiError(503, "Não foi possível gerar o código. Tente de novo.");
    await AuditoriaModel.registrar({
      autor: s, acao: "dispositivo.inscricao_gerada", entidade: "dispositivo", entidadeId: null, ip: ipDe(req),
      resumo: `Gerou o código de inscrição ${codigo} (válido por ${horas} h)`,
    });
    return json({ codigo, servidor, opcoes, comandos: comandosInstalacao(servidor, codigo), validadeHoras: horas, validoAte: expiraEm }, 201);
  }),

  /**
   * GET /i/:codigo — instalação em um comando. Devolve o script certo para quem pediu:
   * PowerShell (irm … | iex) ou sh (curl … | sh). Pelo navegador, mostra como usar.
   */
  instalar: async (req: Request, ctx: { params: Promise<{ codigo: string }> }) => {
    const texto = (corpo: string, status = 200) =>
      new Response(corpo, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    const tipo = scriptPara(req.headers.get("user-agent"));
    const { codigo: bruto } = await ctx.params;
    const codigo = normalizarCodigo(decodeURIComponent(bruto));
    let convite: Convite | null = null;
    try {
      convite = codigo ? await conviteDoCodigo(codigo, ipDe(req)) : null;
    } catch (e) {
      const motivo = e instanceof ApiError ? e.message : "Erro ao consultar o código.";
      return tipo ? texto(scriptErro(tipo, motivo)) : texto(motivo, 429);
    }
    if (!convite || !codigo) {
      const motivo = "Código de instalação inválido ou vencido. Gere outro em Notebooks > Adicionar aparelho > Computador.";
      // 200 com um script que mostra o erro: com 404 o PowerShell só diria "(404) Não Localizado"
      return tipo ? texto(scriptErro(tipo, motivo)) : texto(motivo, 404);
    }
    if (tipo === "powershell") return texto(scriptWindows(convite.servidor, codigo, convite.opcoes));
    if (tipo === "sh") return texto(scriptUnix(convite.servidor, codigo, convite.opcoes));
    const c = comandosInstalacao(convite.servidor, codigo);
    const ate = convite.expiraEm ? new Date(convite.expiraEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : null;
    return texto(`Instalar o agente LabMaker (código ${codigo}${ate ? `, vale até ${ate}` : ""})\n\nWindows: aperte Win+R, cole e dê Enter:\n  ${c.windows}\n\nLinux / macOS, no terminal:\n  ${c.unix}\n`);
  },

  /** POST /api/agente/inscrever — o agente troca o código por um token próprio */
  inscrever: handler(async (req: Request) => {
    const dados = agenteInscreverSchema.parse(await req.json());
    const curto = normalizarCodigo(dados.codigo);
    const jwt = curto ? (await conviteDoCodigo(curto, ipDe(req)))?.jwt : dados.codigo;
    const convite = jwt ? await verificarInscricao(jwt) : null;
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

    // Alarme de devolução: o agente apita sozinho a partir de alarmeEm (usa a hora do servidor)
    const alarme = ctxAuto.emprestimo ? alarmeDevolucao(ctxAuto.emprestimo) : null;
    const pertoDoAlarme = !!alarme && (alarme.tocando || alarme.alarmeEm.getTime() - Date.now() < 2 * 60_000);

    // Atendimento: mensagens novas do Líder e check-in rápido enquanto houver chamado aberto
    const chamado = await ChamadoModel.aberto(d.id);
    const mensagens = chamado ? await ChamadoModel.entregar(chamado.id) : [];
    return json(
      {
        // perto do alarme o check-in fica rápido: a devolução no balcão para o som em segundos
        intervaloSeg: chamado ? CHECKIN_ATENDIMENTO_S : pertoDoAlarme ? CHECKIN_ALARME_S : INTERVALO_CHECKIN_S,
        politica: d.politica, bloqueado: bloqueadoAgora, acoes,
        agora: new Date(),
        devolucao: alarme && { prazoEm: alarme.prazoEm, alarmeEm: alarme.alarmeEm, tocando: alarme.tocando },
        chamado: chamado && { id: chamado.id, numero: chamado.numero, status: chamado.status, descricao: chamado.descricao, atendente: chamado.atendidoPor?.nome ?? null },
        /** a janelinha de chat está aberta no computador? (se não, o agente a abre quando o Líder escrever) */
        janelaAjuda: JanelaAjuda.aberta(d.id),
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

    // resposta do usuário ao pedido de controle remoto
    if (q.controle) {
      if (!sessao || sessao.acaoId !== q.acaoId || !estadoSessao(sessao).ativa) return json({ continuar: false });
      if (sessao.controle === "pedido") {
        TelaStore.responderControle(d.id, q.controle);
        await AuditoriaModel.registrar({
          autor: null, acao: q.controle === "aceito" ? "dispositivo.controle_autorizado" : "dispositivo.controle_negado", entidade: "dispositivo", entidadeId: d.id, ip: ipDe(req),
          resumo: q.controle === "aceito"
            ? `O usuário de ${d.hostname} permitiu que ${sessao.controlePor ?? "o Líder"} controlasse o mouse e o teclado`
            : q.controle === "recusado" ? `O usuário de ${d.hostname} não permitiu o controle remoto` : `${d.hostname} não permite controle remoto neste sistema`,
        });
      }
      return respostaQuadro(TelaStore.buscar(d.id));
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
      return respostaQuadro(TelaStore.buscar(d.id));
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
    return respostaQuadro(TelaStore.buscar(d.id));
  }),

  /**
   * POST /api/agente/tela/controle — o agente busca os eventos de mouse/teclado do Líder.
   * Espera longa: responde na hora em que chega evento (ou em 20 s, vazio), e com continuar: false
   * quando o controle acaba (Líder devolveu, usuário parou, sessão encerrou).
   */
  controle: handler(async (req: Request) => {
    const d = await dispositivoDoToken(req);
    const { acaoId } = agenteControleSchema.parse(await req.json());
    const ativo = () => {
      const s = TelaStore.buscar(d.id);
      return !!s && s.acaoId === acaoId && estadoSessao(s).ativa && s.controle === "ativo";
    };
    if (!ativo()) return json({ continuar: false, eventos: [] });
    const eventos = await new Promise<EventoControle[]>((resolve) => {
      let feito = false;
      const acabar = (abortou = false) => {
        if (feito) return;
        feito = true;
        clearTimeout(t);
        controleEventos.off(d.id, acordar);
        req.signal.removeEventListener("abort", aoAbortar);
        resolve(abortou ? [] : TelaStore.retirarEventos(d.id)); // agente caiu: os eventos ficam para a próxima busca
      };
      const acordar = () => acabar();
      const aoAbortar = () => acabar(true);
      const t = setTimeout(acordar, ESPERA_CONTROLE_MS);
      controleEventos.on(d.id, acordar);
      req.signal.addEventListener("abort", aoAbortar);
      if ((TelaStore.buscar(d.id)?.fila.length ?? 0) > 0) acordar();
    });
    return json({ continuar: ativo(), eventos }, { headers: { "Cache-Control": "no-store" } });
  }),

  /** POST /api/agente/chamados — o usuário do aparelho pede ajuda ao Líder */
  abrirChamado: handler(async (req: Request) => {
    const d = await aparelhoDoChat(req);
    const b = agenteChamadoSchema.parse(await req.json());
    const janela = `${origemDe(req)}/ajuda#t=${await assinarJanelaAjuda(d.id)}`;
    const existente = await ChamadoModel.aberto(d.id);
    if (existente) {
      // já tem um aberto: a nova descrição entra como mensagem, sem duplicar a fila
      if (b.descricao) await ChamadoModel.mensagem(existente.id, "USUARIO", b.nome ?? null, b.descricao);
      return json({ chamado: { id: existente.id, numero: existente.numero, status: existente.status }, jaExistia: true, janela });
    }
    const descricao = b.descricao ?? DESCRICAO_ATALHO;
    let chamado;
    try {
      chamado = await ChamadoModel.criar({ dispositivoId: d.id, descricao, nomeSolicitante: b.nome ?? null, autorizaTela: b.autorizaTela });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") throw new ApiError(409, "Já existe um pedido de ajuda aberto neste aparelho.");
      throw e;
    }
    await AuditoriaModel.registrar({
      autor: null, acao: "chamado.aberto", entidade: "chamado", entidadeId: chamado.id, ip: ipDe(req),
      resumo: `${b.nome ?? "Usuário"} pediu ajuda em ${d.hostname} (#${chamado.numero}): ${descricao.slice(0, 80)}${b.autorizaTela ? " · autorizou ver a tela" : ""}`,
    });
    return json({ chamado: { id: chamado.id, numero: chamado.numero, status: chamado.status }, janela }, 201);
  }),

  /** POST /api/agente/chamados/janela — endereço da janelinha de chat (o agente reabre quando o Líder escreve) */
  janelaChamado: handler(async (req: Request) => {
    const d = await dispositivoDoToken(req);
    return json({ janela: `${origemDe(req)}/ajuda#t=${await assinarJanelaAjuda(d.id)}` });
  }),

  /**
   * POST /api/agente/chamados/estado — a janelinha lê a conversa inteira (a cada 2 s) e avisa que
   * continua aberta. Pode ligar/desligar "o Líder pode ver minha tela".
   */
  estadoChamado: handler(async (req: Request) => {
    const d = await aparelhoDoChat(req);
    const b = agenteJanelaEstadoSchema.parse(await req.json().catch(() => ({})));
    JanelaAjuda.marcar(d.id);
    const aberto = await ChamadoModel.aberto(d.id);
    if (aberto && b.autorizaTela !== undefined && b.autorizaTela !== aberto.autorizaTela) {
      await ChamadoModel.atualizar(aberto.id, { autorizaTela: b.autorizaTela });
      await AuditoriaModel.registrar({
        autor: null, acao: b.autorizaTela ? "chamado.tela_autorizada" : "chamado.tela_desautorizada", entidade: "chamado", entidadeId: aberto.id, ip: ipDe(req),
        resumo: `O usuário de ${d.hostname} ${b.autorizaTela ? "autorizou" : "tirou a autorização de"} o Líder ver a tela no pedido #${aberto.numero}`,
      });
    }
    const c = aberto ? await ChamadoModel.buscar(aberto.id) : null;
    return json(
      {
        hostname: d.hostname,
        chamado: c && {
          id: c.id, numero: c.numero, status: c.status, autorizaTela: c.autorizaTela,
          descricao: c.descricao === DESCRICAO_ATALHO ? null : c.descricao,
          atendente: c.atendidoPor?.nome ?? null,
          mensagens: (c.mensagens ?? []).map((m) => ({ id: m.id, autor: m.autor, autorNome: m.autorNome, texto: m.texto, criadoEm: m.criadoEm })),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),

  /** POST /api/agente/chamados/mensagem — o usuário responde no chat do chamado aberto */
  mensagemChamado: handler(async (req: Request) => {
    const d = await aparelhoDoChat(req);
    const b = agenteMensagemSchema.parse(await req.json());
    const chamado = await ChamadoModel.aberto(d.id);
    if (!chamado) throw new ApiError(404, "Não há pedido de ajuda aberto neste aparelho.");
    // aberto pelo atalho: a primeira coisa que a pessoa escreve vira a descrição na fila do Líder
    if (chamado.descricao === DESCRICAO_ATALHO) await ChamadoModel.atualizar(chamado.id, { descricao: b.texto.slice(0, 500) });
    return json({ mensagem: await ChamadoModel.mensagem(chamado.id, "USUARIO", b.nome ?? null, b.texto) }, 201);
  }),

  /** POST /api/agente/chamados/cancelar — o usuário resolveu sozinho */
  cancelarChamado: handler(async (req: Request) => {
    const d = await aparelhoDoChat(req);
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
