/** MODEL — Alarme (tabela "alarmes") e ComandoRemoto (tabela "comandos_remotos") */
import "server-only";
import { prisma } from "@/lib/prisma";
import type { AlarmeDTO, ComandoDTO, SeveridadeAlarme, StatusComando, TipoComando } from "@/lib/types";

const ORDEM_SEV: Record<SeveridadeAlarme, number> = { CRITICO: 0, AVISO: 1, INFO: 2 };

const selectAlarme = {
  id: true, codigo: true, mensagem: true, severidade: true, ativoDesde: true, encerradoEm: true, reconhecidoEm: true,
  reconhecidoPor: { select: { nome: true } },
  equipamento: { select: { id: true, nome: true, laboratorio: { select: { codigo: true } } } },
} as const;

type AlarmeRow = {
  id: string; codigo: string; mensagem: string; severidade: SeveridadeAlarme; ativoDesde: Date; encerradoEm: Date | null;
  reconhecidoEm: Date | null; reconhecidoPor: { nome: string } | null;
  equipamento: { id: string; nome: string; laboratorio: { codigo: string } };
};

export const toAlarmeDTO = (a: AlarmeRow): AlarmeDTO => ({
  id: a.id, codigo: a.codigo, mensagem: a.mensagem, severidade: a.severidade, ativoDesde: a.ativoDesde.toISOString(),
  encerradoEm: a.encerradoEm?.toISOString() ?? null, reconhecidoEm: a.reconhecidoEm?.toISOString() ?? null,
  reconhecidoPor: a.reconhecidoPor?.nome ?? null,
  equipamento: { id: a.equipamento.id, nome: a.equipamento.nome, laboratorioCodigo: a.equipamento.laboratorio.codigo },
});

/** Ordena do mais grave e mais antigo para o menos grave. */
export const porGravidade = <T extends { severidade: SeveridadeAlarme; ativoDesde: Date | string }>(a: T, b: T) =>
  ORDEM_SEV[a.severidade] - ORDEM_SEV[b.severidade] || new Date(a.ativoDesde).getTime() - new Date(b.ativoDesde).getTime();

export const AlarmeModel = {
  /** Alarmes ativos (de uma máquina ou de todas), mais graves primeiro. */
  async ativos(equipamentoId?: string) {
    const rows = await prisma.alarme.findMany({
      where: { encerradoEm: null, equipamento: { ativo: true }, ...(equipamentoId ? { equipamentoId } : {}) },
      select: selectAlarme,
    });
    return rows.sort(porGravidade).map(toAlarmeDTO);
  },

  async historico(equipamentoId: string, limit = 30) {
    const rows = await prisma.alarme.findMany({ where: { equipamentoId }, orderBy: { ativoDesde: "desc" }, take: limit, select: selectAlarme });
    return rows.map(toAlarmeDTO);
  },

  /** Marca como reconhecidos os alarmes ativos ainda não reconhecidos. Retorna quantos. */
  async reconhecerPendentes(equipamentoId: string, usuarioId: string) {
    const r = await prisma.alarme.updateMany({
      where: { equipamentoId, encerradoEm: null, reconhecidoEm: null },
      data: { reconhecidoEm: new Date(), reconhecidoPorId: usuarioId },
    });
    return r.count;
  },

  /** Encerra os alarmes ativos (ex.: após manutenção corretiva). */
  async encerrarAtivos(equipamentoId: string) {
    const r = await prisma.alarme.updateMany({ where: { equipamentoId, encerradoEm: null }, data: { encerradoEm: new Date() } });
    return r.count;
  },
};

const selectComando = {
  id: true, tipo: true, status: true, motivo: true, justificativa: true, criadoEm: true,
  usuario: { select: { id: true, nome: true } },
} as const;

const toComandoDTO = (c: {
  id: string; tipo: TipoComando; status: StatusComando; motivo: string | null; justificativa: string | null; criadoEm: Date;
  usuario: { id: string; nome: string };
}): ComandoDTO => ({ ...c, criadoEm: c.criadoEm.toISOString() });

export const ComandoModel = {
  async listar(equipamentoId: string, limit = 20) {
    const rows = await prisma.comandoRemoto.findMany({ where: { equipamentoId }, orderBy: { criadoEm: "desc" }, take: limit, select: selectComando });
    return rows.map(toComandoDTO);
  },

  async registrar(d: { equipamentoId: string; usuarioId: string; tipo: TipoComando; status: StatusComando; motivo: string | null; justificativa: string | null }) {
    return toComandoDTO(await prisma.comandoRemoto.create({ data: d, select: selectComando }));
  },
};
