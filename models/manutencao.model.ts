/** MODEL — Manutencao (tabela "manutencoes"): calibrações e manutenções executadas */
import "server-only";
import { prisma } from "@/lib/prisma";
import type { ManutencaoDTO, TipoManutencao } from "@/lib/types";

const select = {
  id: true, tipo: true, descricao: true, realizadaEm: true, certificado: true, validadeAte: true,
  equipamento: { select: { id: true, nome: true, patrimonio: true } },
  responsavel: { select: { id: true, nome: true } },
} as const;

type Row = {
  id: string; tipo: TipoManutencao; descricao: string; realizadaEm: Date; certificado: string | null;
  validadeAte: Date | null;
  equipamento: { id: string; nome: string; patrimonio: string | null };
  responsavel: { id: string; nome: string };
};

const toDTO = (m: Row): ManutencaoDTO => ({
  ...m,
  realizadaEm: m.realizadaEm.toISOString(),
  validadeAte: m.validadeAte?.toISOString() ?? null,
});

export const ManutencaoModel = {
  async listarRecentes(limit = 50, equipamentoId?: string) {
    const rows = await prisma.manutencao.findMany({
      where: equipamentoId ? { equipamentoId } : undefined,
      orderBy: { realizadaEm: "desc" },
      take: limit,
      select,
    });
    return rows.map(toDTO);
  },

  /**
   * Registra o serviço e, na mesma transação, atualiza o equipamento:
   * calibração → nova data de vencimento; `liberar` → status volta a LIVRE.
   */
  async registrar(p: {
    equipamentoId: string; responsavelId: string; tipo: TipoManutencao; descricao: string;
    realizadaEm: Date; certificado: string | null; validadeAte: Date | null; liberar: boolean;
  }) {
    const { liberar, ...dados } = p;
    return prisma.$transaction(async (tx) => {
      const criada = await tx.manutencao.create({ data: dados, select });
      if (p.tipo === "CALIBRACAO" || liberar) {
        await tx.equipamento.update({
          where: { id: p.equipamentoId },
          data: {
            ...(p.tipo === "CALIBRACAO" && p.validadeAte ? { proximaCalibracaoEm: p.validadeAte } : {}),
            ...(liberar ? { status: "LIVRE" as const, estadoMaquina: "OCIOSO" as const } : {}),
          },
        });
      }
      // Liberar após intervenção = condição de falha resolvida: encerra os alarmes ativos
      if (liberar) {
        await tx.alarme.updateMany({ where: { equipamentoId: p.equipamentoId, encerradoEm: null }, data: { encerradoEm: new Date() } });
      }
      return toDTO(criada);
    });
  },
};
