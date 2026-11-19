/**
 * MODEL — RegistroAuditoria (tabela "auditoria")
 * Trilha append-only: este model só expõe INSERT e SELECT.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/permissions";
import type { AuditoriaDTO } from "@/lib/types";

type Autor = { sub: string; nome: string; role: Role } | null;

const toDTO = (r: {
  id: string; criadoEm: Date; acao: string; entidade: string; entidadeId: string | null;
  resumo: string; ip: string | null; usuarioNome: string; usuarioRole: Role | null;
}): AuditoriaDTO => ({
  id: r.id, criadoEm: r.criadoEm.toISOString(), acao: r.acao, entidade: r.entidade,
  entidadeId: r.entidadeId, resumo: r.resumo, ip: r.ip, usuarioNome: r.usuarioNome, usuarioRole: r.usuarioRole,
});

export const AuditoriaModel = {
  /**
   * Grava um evento. Nunca lança: uma falha de auditoria é logada,
   * mas não derruba a operação de negócio que já foi concluída.
   */
  async registrar(e: {
    autor: Autor; acao: string; entidade: string; entidadeId?: string | null;
    resumo: string; dados?: Record<string, unknown>; ip?: string | null;
  }) {
    try {
      await prisma.registroAuditoria.create({
        data: {
          acao: e.acao, entidade: e.entidade, entidadeId: e.entidadeId ?? null, resumo: e.resumo,
          dados: e.dados ? (e.dados as object) : undefined, ip: e.ip ?? null,
          usuarioId: e.autor?.sub ?? null, usuarioNome: e.autor?.nome ?? "Sistema", usuarioRole: e.autor?.role ?? null,
        },
      });
    } catch (err) {
      console.error("[auditoria] falha ao registrar", e.acao, err);
    }
  },

  async listar(f: { entidade?: string; busca?: string; pagina?: number; porPagina?: number }) {
    const porPagina = f.porPagina ?? 25;
    const pagina = Math.max(1, f.pagina ?? 1);
    const where = filtro(f);
    const [total, rows] = await Promise.all([
      prisma.registroAuditoria.count({ where }),
      prisma.registroAuditoria.findMany({
        where, orderBy: { criadoEm: "desc" }, skip: (pagina - 1) * porPagina, take: porPagina,
      }),
    ]);
    return { total, pagina, porPagina, paginas: Math.max(1, Math.ceil(total / porPagina)), registros: rows.map(toDTO) };
  },

  /** Para exportação (CSV): até 5.000 linhas mais recentes com o mesmo filtro da tela. */
  async exportar(f: { entidade?: string; busca?: string }) {
    const rows = await prisma.registroAuditoria.findMany({ where: filtro(f), orderBy: { criadoEm: "desc" }, take: 5000 });
    return rows.map(toDTO);
  },

  async recentes(limit = 6) {
    const rows = await prisma.registroAuditoria.findMany({ orderBy: { criadoEm: "desc" }, take: limit });
    return rows.map(toDTO);
  },
};

function filtro(f: { entidade?: string; busca?: string }) {
  return {
      ...(f.entidade ? { entidade: f.entidade } : {}),
      ...(f.busca
        ? {
            OR: [
              { resumo: { contains: f.busca, mode: "insensitive" as const } },
              { usuarioNome: { contains: f.busca, mode: "insensitive" as const } },
            ],
          }
        : {}),
  };
}
