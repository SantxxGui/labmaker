/** MODEL — Unidade e Laboratorio (tabelas "unidades" e "laboratorios") */
import "server-only";
import { prisma } from "@/lib/prisma";
import type { LaboratorioDTO } from "@/lib/types";

export const LaboratorioModel = {
  /** Laboratórios ativos com a unidade e a contagem de equipamentos. */
  async listar(): Promise<LaboratorioDTO[]> {
    const rows = await prisma.laboratorio.findMany({
      where: { ativo: true },
      orderBy: [{ unidade: { sigla: "asc" } }, { codigo: "asc" }],
      include: {
        unidade: { select: { id: true, nome: true, sigla: true, cidade: true, uf: true } },
        _count: { select: { equipamentos: { where: { ativo: true } } } },
      },
    });
    return rows.map((l) => ({
      id: l.id, nome: l.nome, codigo: l.codigo, descricao: l.descricao,
      unidade: l.unidade, totalEquipamentos: l._count.equipamentos,
    }));
  },

  listarUnidades() {
    return prisma.unidade.findMany({
      where: { ativo: true },
      orderBy: { sigla: "asc" },
      select: { id: true, nome: true, sigla: true, cidade: true, uf: true },
    });
  },

  buscarPorId(id: string) {
    return prisma.laboratorio.findFirst({ where: { id, ativo: true }, select: { id: true, codigo: true } });
  },

  buscarPorCodigo(codigo: string) {
    return prisma.laboratorio.findUnique({ where: { codigo }, select: { id: true } });
  },

  buscarUnidade(id: string) {
    return prisma.unidade.findFirst({ where: { id, ativo: true }, select: { id: true } });
  },

  criar(dados: { nome: string; codigo: string; unidadeId: string; descricao: string | null }) {
    return prisma.laboratorio.create({ data: dados, select: { id: true, nome: true, codigo: true } });
  },
};
