/** MODEL — Chamado e MensagemSuporte (tabelas "chamados" e "mensagens_suporte") */
import "server-only";
import { estaOnline } from "@/lib/agente";
import { prisma } from "@/lib/prisma";
import type { ChamadoDTO, MensagemDTO, StatusChamado } from "@/lib/types";

const selectMsg = { id: true, autor: true, autorNome: true, texto: true, criadoEm: true, entregueEm: true } as const;
const select = {
  id: true, numero: true, descricao: true, nomeSolicitante: true, autorizaTela: true, status: true,
  criadoEm: true, atendidoEm: true, resolvidoEm: true,
  atendidoPor: { select: { nome: true } },
  dispositivo: { select: { id: true, hostname: true, tipo: true, so: true, agenteReal: true, ultimoContatoEm: true } },
  mensagens: { select: selectMsg, orderBy: { criadoEm: "desc" as const }, take: 1 },
} as const;

type MsgRow = { id: string; autor: MensagemDTO["autor"]; autorNome: string | null; texto: string; criadoEm: Date; entregueEm: Date | null };
const toMsg = (m: MsgRow): MensagemDTO => ({ ...m, criadoEm: m.criadoEm.toISOString(), entregueEm: m.entregueEm?.toISOString() ?? null });

type Row = {
  id: string; numero: number; descricao: string; nomeSolicitante: string | null; autorizaTela: boolean; status: StatusChamado;
  criadoEm: Date; atendidoEm: Date | null; resolvidoEm: Date | null; atendidoPor: { nome: string } | null;
  dispositivo: { id: string; hostname: string; tipo: ChamadoDTO["dispositivo"]["tipo"]; so: ChamadoDTO["dispositivo"]["so"]; agenteReal: boolean; ultimoContatoEm: Date | null };
  mensagens: MsgRow[];
};

function toDTO(c: Row, agora = new Date()): ChamadoDTO {
  const { ultimoContatoEm, ...d } = c.dispositivo;
  return {
    id: c.id, numero: c.numero, descricao: c.descricao, nomeSolicitante: c.nomeSolicitante, autorizaTela: c.autorizaTela, status: c.status,
    criadoEm: c.criadoEm.toISOString(), atendidoEm: c.atendidoEm?.toISOString() ?? null, resolvidoEm: c.resolvidoEm?.toISOString() ?? null,
    atendidoPor: c.atendidoPor, dispositivo: { ...d, online: estaOnline(ultimoContatoEm, agora, d.agenteReal) },
    ultimaMensagem: c.mensagens[0] ? toMsg(c.mensagens[0]) : null,
  };
}

const ABERTOS: StatusChamado[] = ["ABERTO", "EM_ATENDIMENTO"];

export const ChamadoModel = {
  /** Fila do Líder: abertos e em atendimento primeiro; resolvidos/cancelados das últimas 24 h embaixo. */
  async fila() {
    const desde = new Date(Date.now() - 24 * 3_600_000);
    const rows = await prisma.chamado.findMany({
      where: { OR: [{ status: { in: ABERTOS } }, { criadoEm: { gte: desde } }] },
      orderBy: [{ criadoEm: "desc" }], take: 60, select,
    });
    const agora = new Date();
    const peso = (s: StatusChamado) => (s === "ABERTO" ? 0 : s === "EM_ATENDIMENTO" ? 1 : 2);
    return rows.map((r) => toDTO(r, agora)).sort((a, b) => peso(a.status) - peso(b.status));
  },

  contarAbertos() {
    return prisma.chamado.count({ where: { status: "ABERTO" } });
  },

  async buscar(id: string) {
    const c = await prisma.chamado.findUnique({ where: { id }, select });
    if (!c) return null;
    const mensagens = await prisma.mensagemSuporte.findMany({ where: { chamadoId: id }, orderBy: { criadoEm: "asc" }, select: selectMsg });
    return { ...toDTO(c), mensagens: mensagens.map(toMsg) };
  },

  /** O chamado aberto do aparelho (há no máximo um — índice único parcial no banco). */
  aberto(dispositivoId: string) {
    return prisma.chamado.findFirst({ where: { dispositivoId, status: { in: ABERTOS } }, select: { id: true, numero: true, status: true, descricao: true, autorizaTela: true, atendidoPor: { select: { nome: true } } } });
  },

  async criar(d: { dispositivoId: string; descricao: string; nomeSolicitante: string | null; autorizaTela: boolean; status?: StatusChamado; atendidoPorId?: string }) {
    const c = await prisma.chamado.create({
      data: { ...d, ...(d.status === "EM_ATENDIMENTO" ? { atendidoEm: new Date() } : {}) },
      select,
    });
    return toDTO(c);
  },

  async mudarStatus(id: string, status: StatusChamado, liderId?: string) {
    const agora = new Date();
    await prisma.chamado.update({
      where: { id },
      data: {
        status,
        ...(status === "EM_ATENDIMENTO" ? { atendidoEm: agora, atendidoPorId: liderId } : {}),
        ...(status === "RESOLVIDO" || status === "CANCELADO" ? { resolvidoEm: agora } : {}),
      },
    });
  },

  async mensagem(chamadoId: string, autor: MensagemDTO["autor"], autorNome: string | null, texto: string) {
    return toMsg(await prisma.mensagemSuporte.create({ data: { chamadoId, autor, autorNome, texto }, select: selectMsg }));
  },

  atualizar(id: string, dados: { descricao?: string; autorizaTela?: boolean }) {
    return prisma.chamado.update({ where: { id }, data: dados, select: { id: true } });
  },

  /** Mensagens do Líder ainda não entregues ao aparelho — já marca como entregues. */
  async entregar(chamadoId: string) {
    const pendentes = await prisma.mensagemSuporte.findMany({ where: { chamadoId, autor: { not: "USUARIO" }, entregueEm: null }, orderBy: { criadoEm: "asc" }, select: selectMsg });
    if (pendentes.length) await prisma.mensagemSuporte.updateMany({ where: { id: { in: pendentes.map((m) => m.id) } }, data: { entregueEm: new Date() } });
    return pendentes.map(toMsg);
  },
};

/** Configurações do sistema guardadas no banco (ex.: chaves VAPID do push). */
export const ConfigModel = {
  async ler(chave: string) {
    return (await prisma.configSistema.findUnique({ where: { chave } }))?.valor ?? null;
  },
  async gravar(chave: string, valor: string) {
    await prisma.configSistema.upsert({ where: { chave }, create: { chave, valor }, update: { valor, atualizadoEm: new Date() } });
  },
};
