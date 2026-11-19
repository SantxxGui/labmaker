/** CONTROLLER — Gestão de dispositivos de TI: frota, alertas, ações remotas e políticas */
import "server-only";
import { avaliarAcao, efeitoAcao, estaOnline, eventoDaAcao } from "@/lib/agente";
import { ApiError, autorizar, handler, ipDe, json } from "@/lib/api";
import { ACAO_DISPOSITIVO_LABEL, MODO_DOWNLOAD_LABEL } from "@/lib/labels";
import { notificarAparelho } from "@/lib/push";
import { TelaStore, estadoSessao, telaEventos } from "@/lib/tela-remota";
import { acaoDispositivoSchema, alertaSchema, dispositivoCreateSchema, politicaPatchSchema } from "@/lib/validators";
import { AuditoriaModel } from "@/models/auditoria.model";
import { AcaoDispositivoModel, DispositivoModel, EventoDispositivoModel, PoliticaModel } from "@/models/dispositivo.model";

type Ctx = { params: Promise<{ id: string }> };
const semCache = { headers: { "Cache-Control": "no-store" } };

export const DispositivoController = {
  /** GET /api/dispositivos — frota com telemetria e conformidade */
  listar: handler(async () => {
    await autorizar("dispositivo:ver");
    return json({ dispositivos: await DispositivoModel.listarPainel() }, semCache);
  }),

  /** POST /api/dispositivos — o Líder cadastra um aparelho do espaço (sem agente ainda) */
  criar: handler(async (req: Request) => {
    const s = await autorizar("dispositivo:cadastrar");
    const d = dispositivoCreateSchema.parse(await req.json());
    const hostname = d.hostname.toUpperCase();
    const dup = await DispositivoModel.existe(hostname, d.numeroSerie);
    if (dup) throw new ApiError(409, dup.numeroSerie === d.numeroSerie ? "Já existe um aparelho com esse número de série." : "Já existe um aparelho com esse nome.");
    const dispositivo = await DispositivoModel.criar({ ...d, hostname, laboratorioId: d.laboratorioId || null, politicaId: d.politicaId || null });
    await AuditoriaModel.registrar({
      autor: s, acao: "dispositivo.cadastrado", entidade: "dispositivo", entidadeId: dispositivo.id, ip: ipDe(req),
      resumo: `Cadastrou ${hostname} (${d.fabricante} ${d.modelo}, série ${d.numeroSerie})`,
    });
    return json({ dispositivo }, 201);
  }),

  /** GET /api/dispositivos/:id — dispositivo, histórico de ações e eventos */
  detalhe: handler(async (_req: Request, ctx: Ctx) => {
    await autorizar("dispositivo:ver");
    const { id } = await ctx.params;
    const dispositivo = await DispositivoModel.buscarPainel(id);
    if (!dispositivo) throw new ApiError(404, "Dispositivo não encontrado.");
    const [acoes, eventos] = await Promise.all([AcaoDispositivoModel.listar(id), EventoDispositivoModel.recentes(30, id)]);
    return json({ dispositivo, acoes, eventos }, semCache);
  }),

  /** GET /api/dispositivos/eventos — feed de eventos de todos os agentes */
  eventos: handler(async () => {
    await autorizar("dispositivo:ver");
    return json({ eventos: await EventoDispositivoModel.recentes(40) }, semCache);
  }),

  /**
   * POST /api/dispositivos/:id/acoes — envia uma ação ao agente.
   * Offline: a ação fica na fila (PENDENTE) até o próximo check-in.
   */
  executar: handler(async (req: Request, ctx: Ctx) => {
    let s = await autorizar("dispositivo:comandar");
    const corpo = acaoDispositivoSchema.parse(await req.json());
    if (corpo.tipo === "APAGAR_DADOS") s = await autorizar("dispositivo:apagar");
    const { id } = await ctx.params;
    const d = await DispositivoModel.buscarPainel(id);
    if (!d) throw new ApiError(404, "Dispositivo não encontrado.");

    const rotulo = `${ACAO_DISPOSITIVO_LABEL[corpo.tipo]}${corpo.parametro ? ` ${corpo.parametro}` : ""} → ${d.hostname}`;
    const avaliacao = avaliarAcao({
      tipo: corpo.tipo, hostname: d.hostname, so: d.so, online: d.leitura.online, bloqueado: d.bloqueado,
      appsInstalados: d.appsInstalados, appsBloqueadosPolitica: d.politica?.appsBloqueados ?? [],
      parametro: corpo.parametro, justificativa: corpo.justificativa, confirmacao: corpo.confirmacao,
    });
    if (!avaliacao.ok) {
      await AuditoriaModel.registrar({
        autor: s, acao: "dispositivo.acao_recusada", entidade: "dispositivo", entidadeId: id, ip: ipDe(req),
        resumo: `${rotulo}: ${avaliacao.motivo}`, dados: { tipo: corpo.tipo },
      });
      throw new ApiError(409, avaliacao.motivo);
    }

    const acao = await AcaoDispositivoModel.registrar({
      dispositivoId: id, usuarioId: s.sub, tipo: corpo.tipo, parametro: corpo.parametro || null, justificativa: corpo.justificativa || null,
      titulo: corpo.titulo || null, mensagem: corpo.mensagem || null, prioridade: corpo.tipo === "ALERTA" ? (corpo.prioridade ?? "INFO") : null,
    });
    // Celular com a página /agente fechada: o aviso também sai como notificação push (se ele se inscreveu)
    if (corpo.tipo === "ALERTA") void notificarAparelho(id, { titulo: corpo.titulo || "Aviso do Líder", corpo: corpo.mensagem || "", tag: acao.id });

    // Simulado e online: o "agente" responde em segundos e o efeito é aplicado já.
    // Agente REAL: o efeito só é aplicado quando ele confirmar a execução no próximo check-in.
    if (!avaliacao.enfileirada && !d.agenteReal) {
      const efeito = efeitoAcao(corpo.tipo, d, corpo.parametro);
      if (Object.keys(efeito).length) await DispositivoModel.atualizar(id, efeito);
      const ev = eventoDaAcao(corpo.tipo, corpo.parametro);
      if (ev) await EventoDispositivoModel.registrar({ dispositivoId: id, ...ev });
    }

    await AuditoriaModel.registrar({
      autor: s, acao: corpo.tipo === "ALERTA" ? "dispositivo.alerta" : "dispositivo.acao", entidade: "dispositivo", entidadeId: id, ip: ipDe(req),
      resumo: `${corpo.tipo === "ALERTA" ? `Alerta "${corpo.titulo}" → ${d.hostname}` : rotulo}${corpo.justificativa ? ` (${corpo.justificativa})` : ""}${avaliacao.enfileirada ? " · na fila" : ""}`,
      dados: { tipo: corpo.tipo, parametro: corpo.parametro ?? null, enfileirada: avaliacao.enfileirada },
    });

    return json({ acao, enfileirada: avaliacao.enfileirada, dispositivo: await DispositivoModel.buscarPainel(id) }, 201);
  }),

  /** POST /api/dispositivos/alertas — alerta em massa (todos, um laboratório ou selecionados) */
  enviarAlerta: handler(async (req: Request) => {
    const s = await autorizar("dispositivo:comandar");
    const a = alertaSchema.parse(await req.json());
    const alvos = await DispositivoModel.alvos({ tipo: a.destino, laboratorioId: a.laboratorioId, ids: a.ids });
    if (alvos.length === 0) throw new ApiError(422, "Nenhum dispositivo no destino escolhido.");

    const lote = `lt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await AcaoDispositivoModel.registrarLote(lote, alvos.map((d) => d.id), {
      usuarioId: s.sub, titulo: a.titulo, mensagem: a.mensagem, prioridade: a.prioridade,
    });
    const online = alvos.filter((d) => estaOnline(d.ultimoContatoEm, new Date(), d.agenteReal)).length;
    for (const d of alvos) void notificarAparelho(d.id, { titulo: a.titulo, corpo: a.mensagem, tag: lote });

    await AuditoriaModel.registrar({
      autor: s, acao: "dispositivo.alerta", entidade: "dispositivo", entidadeId: lote, ip: ipDe(req),
      resumo: `Alerta ${a.prioridade === "CRITICO" ? "crítico " : ""}"${a.titulo}" enviado a ${alvos.length} dispositivo(s)`,
      dados: { destino: a.destino, total: alvos.length, online },
    });
    return json({ lote, total: alvos.length, online, enfileirados: alvos.length - online }, 201);
  }),

  /** GET /api/dispositivos/alertas — alertas em massa recentes e confirmações de leitura */
  lotes: handler(async () => {
    await autorizar("dispositivo:ver");
    return json({ lotes: await AcaoDispositivoModel.lotes() }, semCache);
  }),

  /** GET /api/politicas */
  politicas: handler(async () => {
    await autorizar("dispositivo:ver");
    return json({ politicas: await PoliticaModel.listar() });
  }),

  /** PATCH /api/politicas/:id — altera a política; os agentes aplicam no próximo check-in */
  atualizarPolitica: handler(async (req: Request, ctx: Ctx) => {
    const s = await autorizar("dispositivo:politicas");
    const { id } = await ctx.params;
    const dados = politicaPatchSchema.parse(await req.json());
    const antes = await PoliticaModel.buscar(id);
    if (!antes) throw new ApiError(404, "Política não encontrada.");

    const mudancas: string[] = [];
    if (dados.bloquearUsb !== undefined && dados.bloquearUsb !== antes.bloquearUsb) mudancas.push(`USB ${dados.bloquearUsb ? "bloqueado" : "liberado"}`);
    if (dados.modoDownload && dados.modoDownload !== antes.modoDownload) mudancas.push(`downloads: ${MODO_DOWNLOAD_LABEL[dados.modoDownload]}`);
    if (dados.exigirCriptografia !== undefined && dados.exigirCriptografia !== antes.exigirCriptografia) mudancas.push(`criptografia ${dados.exigirCriptografia ? "obrigatória" : "opcional"}`);
    if (dados.bloqueioTelaMinutos && dados.bloqueioTelaMinutos !== antes.bloqueioTelaMinutos) mudancas.push(`bloqueio de tela ${antes.bloqueioTelaMinutos} → ${dados.bloqueioTelaMinutos} min`);
    if (dados.sitesBloqueados && dados.sitesBloqueados.join() !== antes.sitesBloqueados.join()) mudancas.push(`${dados.sitesBloqueados.length} categorias de site bloqueadas`);
    if (dados.appsBloqueados && dados.appsBloqueados.join() !== antes.appsBloqueados.join()) mudancas.push(`${dados.appsBloqueados.length} apps proibidos`);

    const politica = await PoliticaModel.atualizar(id, dados);
    await AuditoriaModel.registrar({
      autor: s, acao: "politica.atualizada", entidade: "politica", entidadeId: id, ip: ipDe(req),
      resumo: `Política ${politica.nome}: ${mudancas.join(", ") || "sem alterações"}`, dados,
    });
    return json({ politica });
  }),

  /**
   * GET /api/dispositivos/:id/tela — situação do suporte remoto: último pedido e sessão ao vivo.
   * Ver a tela é tão sensível quanto pedir: exige a mesma permissão de comandar.
   */
  telaEstado: handler(async (_req: Request, ctx: Ctx) => {
    await autorizar("dispositivo:comandar");
    const { id } = await ctx.params;
    const pedido = (await AcaoDispositivoModel.listar(id, 30)).find((a) => a.tipo === "SESSAO_REMOTA") ?? null;
    return json(
      { sessao: estadoSessao(TelaStore.buscar(id)), pedido: pedido && { id: pedido.id, status: pedido.status, criadoEm: pedido.criadoEm, motivo: pedido.motivo, justificativa: pedido.justificativa } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),

  /** GET /api/dispositivos/:id/tela/imagem — o último quadro (JPEG/PNG), só enquanto a sessão está ativa */
  telaImagem: handler(async (_req: Request, ctx: Ctx) => {
    await autorizar("dispositivo:comandar");
    const { id } = await ctx.params;
    const s = TelaStore.buscar(id);
    if (!s?.quadro || !estadoSessao(s).ativa) throw new ApiError(404, "Nenhuma tela sendo compartilhada.");
    return new Response(new Uint8Array(s.quadro.dados), {
      headers: { "Content-Type": s.quadro.tipo, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }),

  /** POST /api/dispositivos/:id/tela/encerrar — o Líder encerra o compartilhamento */
  encerrarTela: handler(async (req: Request, ctx: Ctx) => {
    const s = await autorizar("dispositivo:comandar");
    const { id } = await ctx.params;
    const sessao = TelaStore.encerrar(id, `Encerrada por ${s.nome}.`);
    if (!sessao) throw new ApiError(404, "Nenhuma sessão ativa neste aparelho.");
    const d = await DispositivoModel.buscar(id);
    const minutos = Math.max(1, Math.round((Date.now() - sessao.inicio.getTime()) / 60_000));
    await AuditoriaModel.registrar({
      autor: s, acao: "dispositivo.tela_encerrada", entidade: "dispositivo", entidadeId: id, ip: ipDe(req),
      resumo: `Encerrou o suporte remoto em ${d?.hostname ?? id} (${minutos} min)`,
    });
    return json({ ok: true });
  }),

  /**
   * GET /api/dispositivos/:id/tela/eventos — Server-Sent Events: avisa o navegador do Líder na hora em que
   * chega uma imagem nova (ou a sessão acaba). Sem ficar perguntando ao servidor a cada segundo.
   */
  telaEventos: handler(async (req: Request, ctx: Ctx) => {
    await autorizar("dispositivo:comandar");
    const { id } = await ctx.params;
    const enc = new TextEncoder();
    let limpar = () => {};
    const stream = new ReadableStream({
      start(controller) {
        const enviar = (evento: string, dados: unknown) => {
          try { controller.enqueue(enc.encode(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`)); } catch { limpar(); }
        };
        const aoEvento = (e: { tipo: string; versao?: number; motivo?: string }) => enviar(e.tipo, e);
        telaEventos.on(id, aoEvento);
        const s = TelaStore.buscar(id);
        enviar("estado", { versao: s?.versao ?? 0, ativa: estadoSessao(s).ativa });
        const pulso = setInterval(() => { try { controller.enqueue(enc.encode(": pulso\n\n")); } catch { limpar(); } }, 15_000);
        limpar = () => { clearInterval(pulso); telaEventos.off(id, aoEvento); };
        req.signal.addEventListener("abort", () => { limpar(); try { controller.close(); } catch { /* já fechado */ } });
      },
      cancel() { limpar(); },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
    });
  }),
};
