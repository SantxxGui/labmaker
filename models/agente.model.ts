/**
 * MODEL — lado do agente real: inscrição, check-in, entrega de ações e resultados.
 * Usa as tabelas "dispositivos", "acoes_dispositivo" e "eventos_dispositivo".
 */
import "server-only";
import type { TelemetriaAgente } from "@/lib/agente";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { SeveridadeAlarme, SistemaOperacional, TipoDispositivo } from "@/lib/types";

export type DadosInscricao = {
  hostname: string; tipo: TipoDispositivo; so: SistemaOperacional; versaoSo: string; fabricante: string; modelo: string;
  numeroSerie: string; enderecoIp: string | null; enderecoMac: string | null; agenteVersao: string; armazenamentoGb: number;
  politicaId: string | null; laboratorioId: string | null;
};

export const AgenteModel = {
  /** Uma ação deste aparelho (usada para validar a sessão de tela remota). */
  buscarAcao(dispositivoId: string, acaoId: string) {
    return prisma.acaoDispositivo.findFirst({
      where: { id: acaoId, dispositivoId },
      select: { id: true, dispositivoId: true, tipo: true, status: true, criadoEm: true },
    });
  },

  /** Cria o dispositivo (ou reinscreve um existente com o mesmo hostname) e grava o hash do novo token. */
  async inscrever(d: DadosInscricao, tokenHash: string) {
    const existente = await prisma.dispositivo.findUnique({ where: { hostname: d.hostname }, select: { id: true } });
    // Mesmo computador reinscrito com outro nome: o MAC (único) já pertence ao registro antigo → não repete
    const donoMac = d.enderecoMac ? await prisma.dispositivo.findUnique({ where: { enderecoMac: d.enderecoMac }, select: { id: true } }) : null;
    const macLivre = !donoMac || donoMac.id === existente?.id;
    const dados = {
      ...d, enderecoMac: macLivre ? d.enderecoMac : null, agenteReal: true, agenteTokenHash: tokenHash, ativo: true, ultimoContatoEm: new Date(),
      appsInstalados: ["Agente LabMaker"],
    };
    if (existente) {
      const { appsInstalados: _a, numeroSerie: _n, ...semApps } = dados;
      return prisma.dispositivo.update({ where: { id: existente.id }, data: semApps, select: { id: true, hostname: true } });
    }
    const serieLivre = !(await prisma.dispositivo.findUnique({ where: { numeroSerie: d.numeroSerie }, select: { id: true } }));
    return prisma.dispositivo.create({
      data: { ...dados, numeroSerie: serieLivre ? d.numeroSerie : `${d.numeroSerie}-${Date.now().toString(36)}` },
      select: { id: true, hostname: true },
    });
  },

  /** Aparelho pela id (janelinha de ajuda, que não tem o token do agente). */
  porId(id: string) {
    return prisma.dispositivo.findUnique({ where: { id }, select: { id: true, hostname: true, ativo: true } });
  },

  porToken(tokenHash: string) {
    return prisma.dispositivo.findUnique({
      where: { agenteTokenHash: tokenHash },
      select: {
        id: true, hostname: true, tipo: true, ativo: true, bloqueado: true, appsInstalados: true,
        politica: { select: { nome: true, bloquearUsb: true, modoDownload: true, sitesBloqueados: true, appsBloqueados: true, bloqueioTelaMinutos: true, bloquearForaHorario: true } },
      },
    });
  },

  /** Grava o check-in: contato, telemetria e o que o agente informou de segurança. */
  async registrarCheckin(id: string, c: {
    telemetria: TelemetriaAgente; enderecoIp: string | null; versaoSo?: string; agenteVersao?: string;
    seguranca?: { criptografado?: boolean; antivirusAtivo?: boolean; firewallAtivo?: boolean; atualizacoesPendentes?: number };
  }) {
    const agora = new Date();
    await prisma.dispositivo.update({
      where: { id },
      data: {
        ultimoContatoEm: agora, telemetria: c.telemetria, telemetriaEm: agora,
        ...(c.enderecoIp ? { enderecoIp: c.enderecoIp } : {}),
        ...(c.versaoSo ? { versaoSo: c.versaoSo } : {}),
        ...(c.agenteVersao ? { agenteVersao: c.agenteVersao } : {}),
        ...Object.fromEntries(Object.entries(c.seguranca ?? {}).filter(([, v]) => v !== undefined)),
      },
    });
  },

  /** Ações pendentes: entregues neste check-in (PENDENTE → ENTREGUE). */
  async entregarPendentes(id: string) {
    const pendentes = await prisma.acaoDispositivo.findMany({
      where: { dispositivoId: id, status: "PENDENTE" }, orderBy: { criadoEm: "asc" },
      select: { id: true, tipo: true, titulo: true, mensagem: true, prioridade: true, parametro: true, justificativa: true },
    });
    if (pendentes.length) {
      await prisma.acaoDispositivo.updateMany({ where: { id: { in: pendentes.map((p) => p.id) } }, data: { status: "ENTREGUE" } });
    }
    return pendentes;
  },

  /** Resultado informado pelo agente para uma ação que ele recebeu. */
  async concluirAcao(dispositivoId: string, acaoId: string, status: "EXECUTADA" | "RECUSADA", motivo: string | null) {
    const acao = await prisma.acaoDispositivo.findFirst({
      where: { id: acaoId, dispositivoId, status: { in: ["PENDENTE", "ENTREGUE"] } },
      select: { id: true, tipo: true, parametro: true },
    });
    if (!acao) return null;
    await prisma.acaoDispositivo.update({ where: { id: acao.id }, data: { status, motivo, concluidoEm: new Date() } });
    return acao;
  },

  async registrarEventos(dispositivoId: string, eventos: { tipo: string; descricao: string; severidade: SeveridadeAlarme }[]) {
    if (eventos.length) await prisma.eventoDispositivo.createMany({ data: eventos.map((e) => ({ ...e, dispositivoId })) });
  },

  buscarEstado(id: string) {
    return prisma.dispositivo.findUnique({ where: { id }, select: { bloqueado: true, appsInstalados: true } });
  },

  /** O que as automações precisam saber deste aparelho (empréstimo aberto, ações automáticas já feitas, último bloqueio). */
  async contextoAutomacao(dispositivoId: string) {
    const [emprestimo, auto, ultimoBloqueio] = await Promise.all([
      prisma.emprestimo.findFirst({ where: { dispositivoId, devolvidoEm: null }, select: { id: true, prazoEm: true } }),
      prisma.acaoDispositivo.findMany({
        where: { dispositivoId, parametro: { startsWith: "auto:" }, criadoEm: { gte: new Date(Date.now() - 8 * 86_400_000) } },
        select: { parametro: true },
      }),
      prisma.acaoDispositivo.findFirst({
        where: { dispositivoId, tipo: { in: ["BLOQUEAR", "DESBLOQUEAR"] }, status: { not: "RECUSADA" } },
        orderBy: { criadoEm: "desc" }, select: { tipo: true, parametro: true },
      }),
    ]);
    return {
      emprestimo,
      jaFeitas: new Set(auto.map((a) => a.parametro!)),
      ultimoBloqueio: ultimoBloqueio?.tipo === "BLOQUEAR" ? ultimoBloqueio.parametro : null,
    };
  },

  /** Ação criada pela automação (sem usuário). */
  /** Cria a ação automática; devolve null se outra rotina já criou a mesma (índice único parcial). */
  async criarAcaoSistema(dispositivoId: string, a: { tipo: "ALERTA" | "BLOQUEAR" | "DESBLOQUEAR"; parametro: string; titulo?: string; mensagem?: string; prioridade?: "INFO" | "AVISO" | "CRITICO" }) {
    try {
      return await prisma.acaoDispositivo.create({ data: { dispositivoId, usuarioId: null, ...a } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
      throw e;
    }
  },

  /** Aparelhos emprestados que recebem push: o agendador avisa mesmo com o app fechado. */
  alvosDoAgendador() {
    return prisma.dispositivo.findMany({
      where: { ativo: true, pushInscricao: { not: Prisma.DbNull }, emprestimos: { some: { devolvidoEm: null } } },
      select: { id: true, hostname: true, tipo: true, bloqueado: true },
    });
  },

  salvarPush(dispositivoId: string, inscricao: object | null) {
    return prisma.dispositivo.update({ where: { id: dispositivoId }, data: { pushInscricao: inscricao ?? Prisma.DbNull } });
  },
};
