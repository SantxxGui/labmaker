/** CONTROLLER — Painel, auditoria e saúde do sistema */
import "server-only";
import { ApiError, autorizar, handler, ipDe, json } from "@/lib/api";
import { estaOnline } from "@/lib/agente";
import { espacoAberto } from "@/lib/automacao";
import { enderecosDaRede, portaDe, viaHttps } from "@/lib/rede";
import { TelaStore, estadoSessao } from "@/lib/tela-remota";
import { ChamadoModel } from "@/models/chamado.model";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AuditoriaModel } from "@/models/auditoria.model";
import { PainelModel } from "@/models/painel.model";

const inicio = Date.now();

export const SistemaController = {
  /** GET /api/painel — indicadores executivos */
  painel: handler(async () => {
    await autorizar("painel:ver");
    return json(await PainelModel.resumo());
  }),

  /** GET /api/auditoria?entidade=&busca=&pagina= */
  auditoria: handler(async (req: Request) => {
    await autorizar("auditoria:ver");
    const q = new URL(req.url).searchParams;
    return json(
      await AuditoriaModel.listar({
        entidade: q.get("entidade") || undefined,
        busca: q.get("busca") || undefined,
        pagina: Number(q.get("pagina")) || 1,
      }),
    );
  }),

  /**
   * GET /api/auditoria/exportar — CSV (UTF-8 com BOM, separador ";" para abrir direto no Excel em pt-BR).
   * A própria exportação vira um registro de auditoria: quem tirou os dados do sistema, e quando.
   */
  exportarAuditoria: handler(async (req: Request) => {
    const s = await autorizar("auditoria:ver");
    const q = new URL(req.url).searchParams;
    const filtro = { entidade: q.get("entidade") || undefined, busca: q.get("busca") || undefined };
    const linhas = await AuditoriaModel.exportar(filtro);
    const cel = (v: unknown) => {
      let t = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; // evita injeção de fórmula ao abrir no Excel
      return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const csv = [
      ["data_hora", "usuario", "perfil", "acao", "entidade", "entidade_id", "resumo", "ip"].join(";"),
      ...linhas.map((r) => [r.criadoEm, r.usuarioNome, r.usuarioRole, r.acao, r.entidade, r.entidadeId, r.resumo, r.ip].map(cel).join(";")),
    ].join("\r\n");
    await AuditoriaModel.registrar({
      autor: s, acao: "auditoria.exportada", entidade: "auditoria", ip: ipDe(req),
      resumo: `Exportou ${linhas.length} registros de auditoria${filtro.entidade ? ` (${filtro.entidade})` : ""}${filtro.busca ? ` busca "${filtro.busca}"` : ""}`,
    });
    const dia = new Date().toISOString().slice(0, 10);
    return new Response("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="labmaker-auditoria-${dia}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }),

  /** GET /api/health — público; usado por monitoramento / load balancer */
  health: handler(async () => {
    const t0 = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return json({ status: "ok", banco: "ok", latenciaBancoMs: Date.now() - t0, uptimeS: Math.round((Date.now() - inicio) / 1000) });
    } catch {
      return json({ status: "degradado", banco: "indisponivel" }, 503);
    }
  }),

  /** GET /api/sistema/enderecos — IPs deste servidor na rede (atalhos do QR code e do comando do agente) */
  enderecos: handler(async (req: Request) => {
    await autorizar("dispositivo:cadastrar");
    return json({ enderecos: enderecosDaRede(portaDe(req)), https: viaHttps(req), origem: req.headers.get("host") });
  }),

  /** GET /api/sistema/diagnostico — tudo o que a página de pré-apresentação confere */
  diagnostico: handler(async (req: Request) => {
    await autorizar("dispositivo:cadastrar");
    const t0 = performance.now();
    let bancoOk = true;
    try { await prisma.$queryRaw`SELECT 1`; } catch { bancoOk = false; }
    const bancoMs = Math.round(performance.now() - t0);
    if (!bancoOk) return json({ banco: { ok: false, ms: bancoMs } });

    const agora = new Date();
    const host = req.headers.get("host") ?? "";
    const [areas, maquinas, maquinasLivres, aparelhos, alunos, professores, politicasFechamento, chamadosAbertos, inscritosPush, reais] = await Promise.all([
      prisma.laboratorio.count({ where: { ativo: true } }),
      prisma.equipamento.count({ where: { ativo: true } }),
      prisma.equipamento.count({ where: { ativo: true, status: "LIVRE" } }),
      prisma.dispositivo.count({ where: { ativo: true } }),
      prisma.usuario.count({ where: { ativo: true, role: "USUARIO" } }),
      prisma.usuario.count({ where: { ativo: true, role: "GESTOR" } }),
      prisma.politicaDispositivo.count({ where: { bloquearForaHorario: true } }),
      ChamadoModel.contarAbertos(),
      prisma.dispositivo.count({ where: { pushInscricao: { not: Prisma.DbNull } } }),
      prisma.dispositivo.findMany({
        where: { ativo: true, agenteReal: true }, orderBy: { hostname: "asc" },
        select: { id: true, hostname: true, tipo: true, so: true, agenteVersao: true, ultimoContatoEm: true },
      }),
    ]);
    return json({
      banco: { ok: true, ms: bancoMs },
      servidor: { node: process.version, ambiente: process.env.NODE_ENV ?? "development", ligadoHaMin: Math.round(process.uptime() / 60), horaEspaco: agora.toISOString(), espacoAberto: espacoAberto(agora) },
      conexao: { https: viaHttps(req), host, tunel: /trycloudflare\.com|ngrok|loca\.lt/.test(host), localhost: /^(localhost|127\.0\.0\.1)(:|$)/.test(host) },
      enderecos: enderecosDaRede(portaDe(req)),
      espaco: { areas, maquinas, maquinasLivres, aparelhos, alunos, professores, politicasFechamento },
      agentes: reais.map((d) => ({ ...d, online: estaOnline(d.ultimoContatoEm, agora, true), ultimoContatoEm: d.ultimoContatoEm?.toISOString() ?? null, web: d.agenteVersao.startsWith("web-") })),
      atendimento: { chamadosAbertos, telasAtivas: reais.filter((d) => estadoSessao(TelaStore.buscar(d.id), agora).ativa).length },
      push: { inscritos: inscritosPush },
    }, { headers: { "Cache-Control": "no-store" } });
  }),

  /**
   * POST /api/sistema/fechamento { acao: "fechar" | "abrir" } — testa a automação de fechamento agora,
   * sem esperar as 20h: trava (ou destrava) os aparelhos do espaço cuja política tem "bloquear fora do horário".
   */
  testarFechamento: handler(async (req: Request) => {
    const s = await autorizar("dispositivo:politicas");
    const { acao } = (await req.json().catch(() => ({}))) as { acao?: string };
    if (acao !== "fechar" && acao !== "abrir") throw new ApiError(422, "Use acao: fechar ou abrir.");
    const candidatos = await prisma.dispositivo.findMany({
      where: { ativo: true, tipo: { not: "SMARTPHONE" }, politica: { bloquearForaHorario: true }, emprestimos: { none: { devolvidoEm: null } }, bloqueado: acao === "abrir" },
      select: { id: true, hostname: true, agenteReal: true, ultimoContatoEm: true, acoes: { where: { tipo: "BLOQUEAR" }, orderBy: { criadoEm: "desc" }, take: 1, select: { parametro: true } } },
    });
    // "abrir" só destrava o que a automação (ou este teste) travou — nunca um bloqueio manual do Líder
    const alvos = acao === "abrir" ? candidatos.filter((d) => d.acoes[0]?.parametro?.startsWith("auto:")) : candidatos;
    const agora = new Date();
    const marca = `auto:teste:${agora.toISOString()}`;
    for (const d of alvos) {
      await prisma.acaoDispositivo.create({ data: { dispositivoId: d.id, usuarioId: s.sub, tipo: acao === "fechar" ? "BLOQUEAR" : "DESBLOQUEAR", parametro: marca } });
      // aparelho simulado online: o "agente" responde na hora (o real confirma no próximo check-in)
      if (!d.agenteReal && estaOnline(d.ultimoContatoEm, agora)) await prisma.dispositivo.update({ where: { id: d.id }, data: { bloqueado: acao === "fechar" } });
    }
    await AuditoriaModel.registrar({
      autor: s, acao: "dispositivo.automacao", entidade: "dispositivo", entidadeId: null, ip: ipDe(req),
      resumo: `Testou o ${acao === "fechar" ? "fechamento" : "a abertura"} do espaço: ${alvos.length} aparelho(s) ${acao === "fechar" ? "travado(s)" : "liberado(s)"}`,
    });
    return json({ aparelhos: alvos.map((d) => d.hostname) });
  }),
};
