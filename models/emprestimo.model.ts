/** MODEL — Emprestimo (tabela "emprestimos") */
import "server-only";
import { situacaoEmprestimo } from "@/lib/emprestimo";
import { prisma } from "@/lib/prisma";
import type { EmprestimoDTO, TipoDispositivo } from "@/lib/types";

const select = {
  id: true, retiradoEm: true, prazoEm: true, devolvidoEm: true, observacao: true,
  dispositivo: { select: { id: true, hostname: true, tipo: true } },
  usuario: { select: { id: true, nome: true, matricula: true } },
  tecnico: { select: { nome: true } },
  recebidoPor: { select: { nome: true } },
} as const;

type Row = {
  id: string; retiradoEm: Date; prazoEm: Date; devolvidoEm: Date | null; observacao: string | null;
  dispositivo: { id: string; hostname: string; tipo: TipoDispositivo };
  usuario: { id: string; nome: string; matricula: string | null };
  tecnico: { nome: string }; recebidoPor: { nome: string } | null;
};

export const toEmprestimoDTO = (e: Row, agora = new Date()): EmprestimoDTO => ({
  ...e, retiradoEm: e.retiradoEm.toISOString(), prazoEm: e.prazoEm.toISOString(), devolvidoEm: e.devolvidoEm?.toISOString() ?? null,
  situacao: situacaoEmprestimo(e, agora),
});

export const EmprestimoModel = {
  /** Abertos (inclui atrasados) primeiro pelo prazo; ou histórico de um aparelho/aluno. */
  async listar(f: { abertos?: boolean; dispositivoId?: string; usuarioId?: string; limit?: number } = {}) {
    const rows = await prisma.emprestimo.findMany({
      where: {
        ...(f.abertos ? { devolvidoEm: null } : {}),
        ...(f.dispositivoId ? { dispositivoId: f.dispositivoId } : {}),
        ...(f.usuarioId ? { usuarioId: f.usuarioId } : {}),
      },
      orderBy: f.abertos ? { prazoEm: "asc" } : { retiradoEm: "desc" },
      take: f.limit ?? 50,
      select,
    });
    const agora = new Date();
    return rows.map((r) => toEmprestimoDTO(r, agora));
  },

  /** Estado necessário para a regra de empréstimo. */
  async contexto(dispositivoId: string, usuarioId: string) {
    const [dispositivo, aluno, aberto, abertosAluno] = await Promise.all([
      prisma.dispositivo.findUnique({ where: { id: dispositivoId }, select: { hostname: true, tipo: true, ativo: true, bloqueado: true } }),
      prisma.usuario.findUnique({ where: { id: usuarioId }, select: { nome: true, ativo: true } }),
      prisma.emprestimo.count({ where: { dispositivoId, devolvidoEm: null } }),
      prisma.emprestimo.count({ where: { usuarioId, devolvidoEm: null } }),
    ]);
    return { dispositivo, aluno, emprestado: aberto > 0, abertosAluno };
  },

  /** Cria o empréstimo e marca o aluno como "com o aparelho" — tudo numa transação. */
  async criar(d: { dispositivoId: string; usuarioId: string; tecnicoId: string; prazoEm: Date; observacao: string | null }) {
    return prisma.$transaction(async (tx) => {
      const e = await tx.emprestimo.create({ data: d, select });
      await tx.dispositivo.update({ where: { id: d.dispositivoId }, data: { responsavelId: d.usuarioId } });
      return toEmprestimoDTO(e);
    });
  },

  buscarAberto(id: string) {
    return prisma.emprestimo.findFirst({ where: { id, devolvidoEm: null }, select });
  },

  async devolver(id: string, recebidoPorId: string, observacao: string | null) {
    return prisma.$transaction(async (tx) => {
      const e = await tx.emprestimo.update({
        where: { id }, data: { devolvidoEm: new Date(), recebidoPorId, ...(observacao ? { observacao } : {}) }, select,
      });
      await tx.dispositivo.update({ where: { id: e.dispositivo.id }, data: { responsavelId: null } });
      return toEmprestimoDTO(e);
    });
  },
};
