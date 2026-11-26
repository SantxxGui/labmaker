/** MODEL — Agendamento (tabela "agendamentos") */
import "server-only";
import { prisma } from "@/lib/prisma";
import { hojeNoLab, horarioLocal } from "@/lib/slots";
import { toAgendamentoDTO } from "@/lib/serializers";
import type { AgendamentoDTO, StatusAgendamento, TipoEquipamento } from "@/lib/types";

const select = {
  id: true, inicio: true, fim: true, status: true, finalidade: true,
  equipamento: { select: { id: true, nome: true, tipo: true, laboratorio: { select: { codigo: true } } } },
} as const;
const selectComUsuario = { ...select, usuario: { select: { id: true, nome: true, email: true } } } as const;

/** Uma linha do SELECT com JOIN de listarProximos (colunas achatadas, como o Postgres devolve). */
type LinhaReservaComJoin = {
  id: string; inicio: Date; fim: Date; status: StatusAgendamento; finalidade: string | null;
  equipamento_id: string; equipamento_nome: string; equipamento_tipo: TipoEquipamento; laboratorio_codigo: string;
  usuario_id: string; usuario_nome: string; usuario_email: string;
};

export type ResultadoCriacao =
  | { ok: true; agendamento: AgendamentoDTO }
  | { ok: false; motivo: "conflito" | "conflito_proprio" | "limite" | "choque_usuario" };

export const AgendamentoModel = {
  /**
   * Próximas reservas confirmadas de todos (visão de gestão): UMA consulta com INNER JOIN
   * — cada reserva já volta com o nome de quem reservou e da máquina (sem isso o Prisma faria
   * três SELECTs separados). Os valores vão como parâmetros ($1), nunca colados no SQL.
   */
  async listarProximos(limit = 100) {
    const rows = await prisma.$queryRaw<LinhaReservaComJoin[]>`
      SELECT a.id, a.inicio, a.fim, a.status::text AS status, a.finalidade,
             e.id AS equipamento_id, e.nome AS equipamento_nome, e.tipo::text AS equipamento_tipo,
             l.codigo AS laboratorio_codigo,
             u.id AS usuario_id, u.nome AS usuario_nome, u.email AS usuario_email
        FROM agendamentos a
        INNER JOIN usuarios u     ON u.id = a.usuario_id
        INNER JOIN equipamentos e ON e.id = a.equipamento_id
        INNER JOIN laboratorios l ON l.id = e.laboratorio_id
       WHERE a.status = 'CONFIRMADO' AND a.fim >= NOW()
       ORDER BY a.inicio ASC
       LIMIT ${limit}`;
    return rows.map((r) =>
      toAgendamentoDTO({
        id: r.id, inicio: r.inicio, fim: r.fim, status: r.status, finalidade: r.finalidade,
        equipamento: { id: r.equipamento_id, nome: r.equipamento_nome, tipo: r.equipamento_tipo, laboratorio: { codigo: r.laboratorio_codigo } },
        usuario: { id: r.usuario_id, nome: r.usuario_nome, email: r.usuario_email },
      }),
    );
  },

  /** Próximas reservas confirmadas de um usuário. */
  async listarDoUsuario(usuarioId: string) {
    const rows = await prisma.agendamento.findMany({
      where: { usuarioId, status: "CONFIRMADO", fim: { gte: new Date() } },
      orderBy: { inicio: "asc" },
      select,
    });
    return rows.map(toAgendamentoDTO);
  },

  /** Próximas reservas confirmadas de um equipamento. */
  async listarDoEquipamento(equipamentoId: string, limit = 8) {
    const rows = await prisma.agendamento.findMany({
      where: { equipamentoId, status: "CONFIRMADO", fim: { gte: new Date() } },
      orderBy: { inicio: "asc" },
      take: limit,
      select: selectComUsuario,
    });
    return rows.map(toAgendamentoDTO);
  },

  contarHoje() {
    const hoje = hojeNoLab();
    return prisma.agendamento.count({
      where: { status: { not: "CANCELADO" }, inicio: { gte: horarioLocal(hoje, 0), lt: horarioLocal(hoje, 24 * 60) } },
    });
  },

  /** Intervalos já reservados de um equipamento em um dia (YYYY-MM-DD). */
  ocupadosNoDia(equipamentoId: string, data: string) {
    return prisma.agendamento.findMany({
      where: {
        equipamentoId, status: "CONFIRMADO",
        inicio: { lt: horarioLocal(data, 24 * 60) }, fim: { gt: horarioLocal(data, 0) },
      },
      select: { inicio: true, fim: true, usuarioId: true },
    });
  },

  buscarPorId(id: string) {
    return prisma.agendamento.findUnique({
      where: { id },
      select: {
        id: true, usuarioId: true, inicio: true, fim: true, status: true,
        equipamento: { select: { nome: true } },
      },
    });
  },

  cancelar(id: string) {
    return prisma.agendamento.update({ where: { id }, data: { status: "CANCELADO", canceladoEm: new Date() } });
  },

  /**
   * Cria a reserva de forma ATÔMICA. Uma trava por equipamento
   * (pg_advisory_xact_lock) serializa pedidos simultâneos para a mesma máquina:
   * duas pessoas nunca conseguem o mesmo horário, mesmo clicando juntas.
   */
  async criarSemConflito(p: {
    equipamentoId: string; usuarioId: string; inicio: Date; fim: Date;
    limiteAtivas: number | null; // null = sem limite
    finalidade?: string;
  }): Promise<ResultadoCriacao> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${p.equipamentoId}))`;

      const conflito = await tx.agendamento.findFirst({
        where: { equipamentoId: p.equipamentoId, status: "CONFIRMADO", inicio: { lt: p.fim }, fim: { gt: p.inicio } },
        select: { usuarioId: true },
      });
      if (conflito) {
        return { ok: false, motivo: conflito.usuarioId === p.usuarioId ? "conflito_proprio" : "conflito" } as const;
      }

      if (p.limiteAtivas !== null) {
        const ativas = await tx.agendamento.count({
          where: { usuarioId: p.usuarioId, status: "CONFIRMADO", fim: { gt: new Date() } },
        });
        if (ativas >= p.limiteAtivas) return { ok: false, motivo: "limite" } as const;
      }

      const choque = await tx.agendamento.findFirst({
        where: { usuarioId: p.usuarioId, status: "CONFIRMADO", inicio: { lt: p.fim }, fim: { gt: p.inicio } },
        select: { id: true },
      });
      if (choque) return { ok: false, motivo: "choque_usuario" } as const;

      const criado = await tx.agendamento.create({
        data: {
          equipamentoId: p.equipamentoId, usuarioId: p.usuarioId,
          inicio: p.inicio, fim: p.fim, finalidade: p.finalidade || null,
        },
        select,
      });
      return { ok: true, agendamento: toAgendamentoDTO(criado) } as const;
    });
  },
};
