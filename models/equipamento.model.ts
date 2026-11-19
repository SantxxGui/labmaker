/** MODEL — Equipamento (tabela "equipamentos") */
import "server-only";
import { prisma } from "@/lib/prisma";
import { toEquipamentoDTO } from "@/lib/serializers";
import { hojeNoLab, horarioLocal } from "@/lib/slots";
import type { MaquinaParaLeitura } from "@/lib/telemetria";
import type { Criticidade, EstadoMaquina, SeveridadeAlarme, StatusEquipamento, TipoEquipamento } from "@/lib/types";

const ORDEM_SEV: Record<SeveridadeAlarme, number> = { CRITICO: 0, AVISO: 1, INFO: 2 };

const include = {
  laboratorio: { select: { id: true, nome: true, codigo: true, unidade: { select: { sigla: true } } } },
} as const;

export const EquipamentoModel = {
  /** Equipamentos ativos (opcionalmente de um laboratório) + reservas confirmadas hoje. */
  async listarAtivos(laboratorioId?: string) {
    const hoje = hojeNoLab();
    const rows = await prisma.equipamento.findMany({
      where: { ativo: true, ...(laboratorioId ? { laboratorioId } : {}) },
      orderBy: [{ laboratorio: { codigo: "asc" } }, { nome: "asc" }],
      include: {
        ...include,
        _count: {
          select: {
            agendamentos: {
              where: {
                status: { not: "CANCELADO" },
                inicio: { gte: horarioLocal(hoje, 0), lt: horarioLocal(hoje, 24 * 60) },
              },
            },
          },
        },
      },
    });
    return rows.map((e) => toEquipamentoDTO(e, e._count.agendamentos));
  },

  /** DTO completo de um equipamento ativo (página de detalhe). */
  async buscarDTO(id: string) {
    const e = await prisma.equipamento.findFirst({ where: { id, ativo: true }, include });
    return e ? toEquipamentoDTO(e) : null;
  },

  /**
   * Dados de entrada da telemetria: estado físico + alarme ativo mais grave.
   * Com `id`, retorna só aquela máquina.
   */
  async paraTelemetria(id?: string): Promise<MaquinaParaLeitura[]> {
    const rows = await prisma.equipamento.findMany({
      where: { ativo: true, ...(id ? { id } : {}) },
      select: {
        id: true, tipo: true, status: true, estadoMaquina: true, ultimoContatoEm: true,
        alarmes: { where: { encerradoEm: null }, select: { codigo: true, mensagem: true, severidade: true, ativoDesde: true } },
      },
    });
    return rows.map(({ alarmes, ...m }) => {
      const pior = [...alarmes].sort((a, b) => ORDEM_SEV[a.severidade] - ORDEM_SEV[b.severidade] || a.ativoDesde.getTime() - b.ativoDesde.getTime())[0];
      return { ...m, alarmeAtivo: pior ? { codigo: pior.codigo, mensagem: pior.mensagem, severidade: pior.severidade } : null };
    });
  },

  /** Contexto para avaliar um comando remoto. */
  buscarParaComando(id: string) {
    return prisma.equipamento.findFirst({
      where: { id, ativo: true },
      select: {
        id: true, nome: true, status: true, estadoMaquina: true,
        alarmes: { where: { encerradoEm: null }, select: { severidade: true, reconhecidoEm: true } },
      },
    });
  },

  atualizarEstado(id: string, estadoMaquina: EstadoMaquina) {
    return prisma.equipamento.update({ where: { id }, data: { estadoMaquina, ultimoContatoEm: new Date() } });
  },

  /** Dados mínimos para as regras de reserva. */
  buscarAtivo(id: string) {
    return prisma.equipamento.findFirst({
      where: { id, ativo: true },
      select: {
        id: true, nome: true, status: true, duracaoSlotMinutos: true,
        requerCalibracao: true, proximaCalibracaoEm: true, intervaloCalibracaoDias: true,
      },
    });
  },

  buscarPorIp(enderecoIp: string) {
    return prisma.equipamento.findFirst({ where: { enderecoIp, ativo: true }, select: { id: true } });
  },

  buscarPorPatrimonio(patrimonio: string) {
    return prisma.equipamento.findUnique({ where: { patrimonio }, select: { id: true } });
  },

  async criar(dados: {
    nome: string; tipo: TipoEquipamento; laboratorioId: string; fabricante: string | null;
    modelo: string | null; patrimonio: string | null; localizacao: string | null;
    criticidade: Criticidade; duracaoSlotMinutos: number; requerCalibracao: boolean;
    intervaloCalibracaoDias: number | null; enderecoIp: string | null;
  }) {
    // Sem IP do gateway não há de onde ler telemetria: a máquina nasce "sem conexão",
    // mas continua LIVRE para reserva — os alunos já podem usar.
    const estadoMaquina = dados.enderecoIp ? "OCIOSO" : "OFFLINE";
    return toEquipamentoDTO(await prisma.equipamento.create({ data: { ...dados, estadoMaquina }, include }), 0);
  },

  async atualizar(
    id: string,
    dados: { nome?: string; status?: StatusEquipamento; criticidade?: Criticidade; localizacao?: string | null },
  ) {
    return toEquipamentoDTO(await prisma.equipamento.update({ where: { id }, data: dados, include }));
  },

  /** Soft delete: desativa e cancela as reservas futuras (atômico). Retorna quantas foram canceladas. */
  async desativar(id: string) {
    const [, canceladas] = await prisma.$transaction([
      prisma.equipamento.update({ where: { id }, data: { ativo: false } }),
      prisma.agendamento.updateMany({
        where: { equipamentoId: id, status: "CONFIRMADO", inicio: { gte: new Date() } },
        data: { status: "CANCELADO", canceladoEm: new Date() },
      }),
    ]);
    return canceladas.count;
  },
};
