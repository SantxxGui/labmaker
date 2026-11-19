/**
 * MODEL — Painel executivo
 * Busca os dados no banco; o cálculo dos indicadores fica em lib/painel.ts.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { calcularPainel, janelaPainel } from "@/lib/painel";
import type { PainelDTO } from "@/lib/types";
import { AgendamentoModel } from "@/models/agendamento.model";
import { AuditoriaModel } from "@/models/auditoria.model";

export const PainelModel = {
  async resumo(): Promise<PainelDTO> {
    const agora = new Date();
    const j = janelaPainel(agora);
    const [equipamentos, historico, reservasHoje, reservasProximos7d, proximas, atividade] = await Promise.all([
      prisma.equipamento.findMany({
        where: { ativo: true },
        select: {
          id: true, nome: true, patrimonio: true, status: true, requerCalibracao: true, proximaCalibracaoEm: true,
          laboratorio: { select: { id: true, codigo: true, nome: true } },
        },
      }),
      prisma.agendamento.findMany({
        where: { status: { not: "CANCELADO" }, inicio: { gte: j.inicio, lt: j.fimHoje } },
        select: { inicio: true, fim: true, equipamentoId: true },
      }),
      AgendamentoModel.contarHoje(),
      prisma.agendamento.count({ where: { status: "CONFIRMADO", inicio: { gte: agora, lt: j.fim7d } } }),
      AgendamentoModel.listarProximos(6),
      AuditoriaModel.recentes(7),
    ]);
    return calcularPainel({ agora, equipamentos, historico, reservasHoje, reservasProximos7d, proximas, atividade });
  },
};
