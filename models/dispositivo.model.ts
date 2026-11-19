/**
 * MODEL — Dispositivos de TI: "dispositivos", "politicas_dispositivo", "acoes_dispositivo", "eventos_dispositivo".
 * Único ponto de acesso a essas tabelas.
 */
import "server-only";
import { LIMITE_OFFLINE_MS, SEM_AGENTE, nomeRemovido } from "@/lib/agente";
import { Prisma } from "@/lib/generated/prisma/client";
import { toAcaoDTO, toDispositivoDTO, toEventoDTO, toPainelDTO, toPoliticaDTO, resumirLotes, type DispositivoRow } from "@/lib/dispositivo-dto";
import { prisma } from "@/lib/prisma";
import type { ModoDownload, SeveridadeAlarme, SistemaOperacional, StatusAcao, TipoAcaoDispositivo, TipoDispositivo } from "@/lib/types";

const selectDispositivo = {
  id: true, hostname: true, tipo: true, so: true, versaoSo: true, fabricante: true, modelo: true, numeroSerie: true, enderecoIp: true,
  enderecoMac: true, agenteVersao: true, criptografado: true, antivirusAtivo: true, firewallAtivo: true, atualizacoesPendentes: true,
  armazenamentoGb: true, bloqueado: true, appsInstalados: true, ultimoContatoEm: true, agenteReal: true, telemetria: true,
  responsavel: { select: { id: true, nome: true } },
  laboratorio: { select: { id: true, codigo: true, nome: true, unidade: { select: { sigla: true } } } },
  politica: { select: { id: true, nome: true, exigirCriptografia: true, appsBloqueados: true } },
} as const;

const selectAcao = {
  id: true, tipo: true, status: true, lote: true, titulo: true, mensagem: true, prioridade: true, parametro: true, justificativa: true,
  motivo: true, criadoEm: true, concluidoEm: true,
  usuario: { select: { id: true, nome: true } },
  dispositivo: { select: { id: true, hostname: true, tipo: true, ultimoContatoEm: true, agenteReal: true } },
} as const;

const selectEvento = {
  id: true, tipo: true, descricao: true, severidade: true, criadoEm: true,
  dispositivo: { select: { id: true, hostname: true, tipo: true } },
} as const;

/**
 * Simulador do agente: dispositivos com contato recente "fazem check-in" a cada leitura.
 * Em produção quem atualiza `ultimo_contato_em` é o próprio agente (POST de check-in).
 */
async function checkinSimulado() {
  await prisma.dispositivo.updateMany({
    where: { ativo: true, agenteReal: false, ultimoContatoEm: { gte: new Date(Date.now() - LIMITE_OFFLINE_MS) } },
    data: { ultimoContatoEm: new Date() },
  });
}

export const DispositivoModel = {
  /**
   * Cadastro manual (sem agente): o aparelho já pode ser emprestado e recebe ações na fila.
   * Quando o agente for instalado com o mesmo nome (--nome), ele assume este registro.
   */
  async criar(d: {
    hostname: string; tipo: TipoDispositivo; so: SistemaOperacional; fabricante: string; modelo: string;
    numeroSerie: string; laboratorioId: string | null; politicaId: string | null;
  }) {
    const r = await prisma.dispositivo.create({
      data: { ...d, versaoSo: SEM_AGENTE, agenteVersao: SEM_AGENTE, armazenamentoGb: 0, appsInstalados: [], ultimoContatoEm: null },
      select: selectDispositivo,
    });
    return toPainelDTO(r as DispositivoRow, new Date());
  },

  /** Dados para decidir a remoção (nome atual e se há empréstimo aberto). */
  async paraRemocao(id: string) {
    const d = await prisma.dispositivo.findFirst({ where: { id, ativo: true }, select: { id: true, hostname: true, numeroSerie: true, fabricante: true, modelo: true } });
    if (!d) return null;
    const emprestimoAberto = !!(await prisma.emprestimo.findFirst({ where: { dispositivoId: id, devolvidoEm: null }, select: { id: true } }));
    return { ...d, emprestimoAberto };
  },

  /**
   * Remove o aparelho: some das listas, o token do agente deixa de valer (a página do celular pede
   * um QR novo), pedidos de ajuda abertos são cancelados e ações não entregues são recusadas.
   * Nome e nº de série ganham o sufixo "(removido …)" para poderem ser usados de novo.
   */
  remover(id: string, hostname: string, numeroSerie: string) {
    const agora = new Date();
    return prisma.$transaction([
      prisma.dispositivo.update({
        where: { id },
        data: {
          ativo: false, agenteTokenHash: null, pushInscricao: Prisma.DbNull, bloqueado: false, responsavelId: null, enderecoMac: null,
          hostname: nomeRemovido(hostname, agora), numeroSerie: `${numeroSerie}~removido-${agora.getTime().toString(36)}`,
        },
      }),
      prisma.chamado.updateMany({ where: { dispositivoId: id, status: { in: ["ABERTO", "EM_ATENDIMENTO"] } }, data: { status: "CANCELADO" } }),
      prisma.acaoDispositivo.updateMany({ where: { dispositivoId: id, status: { in: ["PENDENTE", "ENTREGUE"] } }, data: { status: "RECUSADA", motivo: "Aparelho removido do LabMaker" } }),
    ]);
  },

  existe(hostname: string, numeroSerie: string) {
    return prisma.dispositivo.findFirst({ where: { OR: [{ hostname: { equals: hostname, mode: "insensitive" } }, { numeroSerie }] }, select: { hostname: true, numeroSerie: true } });
  },

  async listarPainel() {
    await checkinSimulado();
    const rows = await prisma.dispositivo.findMany({ where: { ativo: true }, select: selectDispositivo, orderBy: { hostname: "asc" } });
    const agora = new Date();
    return rows.map((r) => toPainelDTO(r as DispositivoRow, agora));
  },

  async buscarPainel(id: string) {
    await checkinSimulado();
    const r = await prisma.dispositivo.findFirst({ where: { id, ativo: true }, select: selectDispositivo });
    return r ? toPainelDTO(r as DispositivoRow) : null;
  },

  async buscar(id: string) {
    const r = await prisma.dispositivo.findFirst({ where: { id, ativo: true }, select: selectDispositivo });
    return r ? toDispositivoDTO(r as DispositivoRow) : null;
  },

  /** Destinatários de um alerta em massa. */
  async alvos(destino: { tipo: "todos" | "laboratorio" | "selecionados"; laboratorioId?: string; ids?: string[] }) {
    return prisma.dispositivo.findMany({
      where: {
        ativo: true,
        ...(destino.tipo === "laboratorio" ? { laboratorioId: destino.laboratorioId } : {}),
        ...(destino.tipo === "selecionados" ? { id: { in: destino.ids ?? [] } } : {}),
      },
      select: { id: true, hostname: true, ultimoContatoEm: true, agenteReal: true },
    });
  },

  async atualizar(id: string, data: { bloqueado?: boolean; appsInstalados?: string[]; ultimoContatoEm?: Date }) {
    await prisma.dispositivo.update({ where: { id }, data });
  },

  async contar() {
    return prisma.dispositivo.count({ where: { ativo: true } });
  },
};

export const AcaoDispositivoModel = {
  async listar(dispositivoId: string, limit = 30) {
    const rows = await prisma.acaoDispositivo.findMany({
      where: { dispositivoId }, select: selectAcao, orderBy: { criadoEm: "desc" }, take: limit,
    });
    const agora = new Date();
    return rows.map((r) => toAcaoDTO(r, agora));
  },

  async registrar(d: {
    dispositivoId: string; usuarioId: string; tipo: TipoAcaoDispositivo; status?: StatusAcao; lote?: string | null; titulo?: string | null;
    mensagem?: string | null; prioridade?: SeveridadeAlarme | null; parametro?: string | null; justificativa?: string | null;
  }) {
    const r = await prisma.acaoDispositivo.create({ data: { status: "PENDENTE", ...d }, select: selectAcao });
    return toAcaoDTO(r);
  },

  /** Um alerta em massa = uma ação por dispositivo, todas com o mesmo lote. */
  async registrarLote(lote: string, dispositivoIds: string[], d: { usuarioId: string; titulo: string; mensagem: string; prioridade: SeveridadeAlarme }) {
    await prisma.acaoDispositivo.createMany({
      data: dispositivoIds.map((dispositivoId) => ({ ...d, lote, dispositivoId, tipo: "ALERTA" as const, status: "PENDENTE" as const })),
    });
  },

  /** Alertas em massa recentes, com contagem de entregues e lidos. */
  async lotes(limit = 8) {
    const rows = await prisma.acaoDispositivo.findMany({
      where: { tipo: "ALERTA", lote: { not: null }, criadoEm: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      select: selectAcao, orderBy: { criadoEm: "desc" },
    });
    const agora = new Date();
    return resumirLotes(rows.map((r) => toAcaoDTO(r, agora))).slice(0, limit);
  },
};

export const EventoDispositivoModel = {
  async recentes(limit = 30, dispositivoId?: string) {
    const rows = await prisma.eventoDispositivo.findMany({
      where: dispositivoId ? { dispositivoId } : {}, select: selectEvento, orderBy: { criadoEm: "desc" }, take: limit,
    });
    return rows.map(toEventoDTO);
  },

  async registrar(d: { dispositivoId: string; tipo: string; descricao: string; severidade: SeveridadeAlarme }) {
    await prisma.eventoDispositivo.create({ data: d });
  },
};

export const PoliticaModel = {
  async listar() {
    const rows = await prisma.politicaDispositivo.findMany({
      orderBy: { nome: "asc" },
      include: { _count: { select: { dispositivos: { where: { ativo: true } } } } },
    });
    return rows.map(({ _count, ...p }) => toPoliticaDTO({ ...p, totalDispositivos: _count.dispositivos }));
  },

  async buscar(id: string) {
    return prisma.politicaDispositivo.findUnique({ where: { id } });
  },

  async atualizar(id: string, data: Partial<{
    bloquearUsb: boolean; modoDownload: ModoDownload; sitesBloqueados: string[]; appsBloqueados: string[];
    exigirCriptografia: boolean; bloqueioTelaMinutos: number; bloquearForaHorario: boolean;
  }>) {
    const p = await prisma.politicaDispositivo.update({
      where: { id }, data, include: { _count: { select: { dispositivos: { where: { ativo: true } } } } },
    });
    const { _count, ...resto } = p;
    return toPoliticaDTO({ ...resto, totalDispositivos: _count.dispositivos });
  },
};
