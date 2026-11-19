/**
 * Indicadores do painel executivo — cálculo puro (sem banco).
 * Utilização = horas reservadas ÷ horas ofertadas (equipamentos × horas de expediente × dias abertos).
 */
import { LAB, bloqueadoPorCalibracao, diaDaSemana, diaNoLab, hojeNoLab, horarioLocal, situacaoCalibracao } from "@/lib/slots";
import type { AgendamentoDTO, AuditoriaDTO, PainelDTO, StatusEquipamento } from "@/lib/types";

export type EquipamentoPainel = {
  id: string; nome: string; patrimonio: string | null; status: StatusEquipamento;
  requerCalibracao: boolean; proximaCalibracaoEm: Date | null;
  laboratorio: { id: string; codigo: string; nome: string };
};
export type ReservaPainel = { inicio: Date; fim: Date; equipamentoId: string };

const HORAS_DIA = LAB.fechamento - LAB.abertura;
export const somarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const aberto = (iso: string) => !(LAB.diasFechados as number[]).includes(diaDaSemana(iso));
const horas = (a: { inicio: Date; fim: Date }) => (a.fim.getTime() - a.inicio.getTime()) / 3_600_000;

/** Janela de 14 dias (inclui hoje) e limites usados nas consultas do painel. */
export function janelaPainel(agora = new Date()) {
  const hoje = hojeNoLab(agora);
  const dias14 = Array.from({ length: 14 }, (_, i) => somarDias(hoje, i - 13));
  return {
    hoje,
    dias14,
    inicio: horarioLocal(dias14[0], 0),
    fimHoje: horarioLocal(hoje, 24 * 60),
    fim7d: horarioLocal(somarDias(hoje, 7), 24 * 60),
  };
}

export function calcularPainel(p: {
  agora: Date;
  equipamentos: EquipamentoPainel[];
  historico: ReservaPainel[]; // reservas não canceladas dentro da janela
  reservasHoje: number;
  reservasProximos7d: number;
  proximas: AgendamentoDTO[];
  atividade: AuditoriaDTO[];
}): PainelDTO {
  const { agora, equipamentos, historico, reservasHoje, reservasProximos7d, proximas, atividade } = p;
  const { dias14 } = janelaPainel(agora);

    // ── Equipamentos e calibração ──
    const comSituacao = equipamentos.map((e) => ({ ...e, situacao: situacaoCalibracao(e, agora) }));
    const alertas = comSituacao
      .filter((e) => e.situacao === "VENCIDA" || e.situacao === "PENDENTE" || e.situacao === "A_VENCER")
      .sort((a, b) => (a.proximaCalibracaoEm?.getTime() ?? 0) - (b.proximaCalibracaoEm?.getTime() ?? 0));

    // ── Série diária (14 dias) ──
    const porDia = new Map(dias14.map((d) => [d, { horas: 0, reservas: 0 }]));
    const horasPorEquip = new Map<string, number>();
    const horasPorEquip7d = new Map<string, number>();
    const ultimos7 = new Set(dias14.slice(7));
    let horas7d = 0;
    let horas7dAnterior = 0;
    for (const a of historico) {
      const dia = diaNoLab(a.inicio);
      const h = horas(a);
      const slot = porDia.get(dia);
      if (slot) { slot.horas += h; slot.reservas += 1; }
      horasPorEquip.set(a.equipamentoId, (horasPorEquip.get(a.equipamentoId) ?? 0) + h);
      if (ultimos7.has(dia)) {
        horas7d += h;
        horasPorEquip7d.set(a.equipamentoId, (horasPorEquip7d.get(a.equipamentoId) ?? 0) + h);
      } else horas7dAnterior += h;
    }

    // ── Utilização = horas reservadas ÷ horas ofertadas ──
    const diasAbertos = (dias: string[]) => dias.filter(aberto).length;
    const capacidade = (nEquip: number, dias: string[]) => nEquip * HORAS_DIA * diasAbertos(dias);
    const taxa = (h: number, cap: number) => (cap > 0 ? Math.min(1, h / cap) : 0);
    const n = equipamentos.length;

    const labs = new Map<string, { id: string; codigo: string; nome: string; equipamentos: number; horas: number }>();
    for (const e of equipamentos) {
      const l = labs.get(e.laboratorio.id) ?? { ...e.laboratorio, equipamentos: 0, horas: 0 };
      l.equipamentos += 1;
      l.horas += horasPorEquip7d.get(e.id) ?? 0;
      labs.set(e.laboratorio.id, l);
    }

    return {
      equipamentos: {
        total: n,
        livres: equipamentos.filter((e) => e.status === "LIVRE").length,
        emUso: equipamentos.filter((e) => e.status === "EM_USO").length,
        manutencao: equipamentos.filter((e) => e.status === "MANUTENCAO").length,
        bloqueadosCalibracao: comSituacao.filter((e) => bloqueadoPorCalibracao(e.situacao)).length,
      },
      utilizacao7d: taxa(horas7d, capacidade(n, dias14.slice(7))),
      utilizacao7dAnterior: taxa(horas7dAnterior, capacidade(n, dias14.slice(0, 7))),
      reservasHoje,
      reservasProximos7d,
      calibracao: {
        vencidas: comSituacao.filter((e) => bloqueadoPorCalibracao(e.situacao)).length,
        aVencer30d: comSituacao.filter((e) => e.situacao === "A_VENCER").length,
      },
      reservasPorDia: dias14.map((dia) => ({ dia, ...porDia.get(dia)!, horas: Math.round(porDia.get(dia)!.horas * 10) / 10 })),
      porLaboratorio: [...labs.values()]
        .map((l) => ({ ...l, horas: Math.round(l.horas), utilizacao: taxa(l.horas, capacidade(l.equipamentos, dias14.slice(7))) }))
        .sort((a, b) => b.utilizacao - a.utilizacao),
      topEquipamentos: equipamentos
        .map((e) => ({ id: e.id, nome: e.nome, laboratorioCodigo: e.laboratorio.codigo, horas: Math.round(horasPorEquip.get(e.id) ?? 0) }))
        .sort((a, b) => b.horas - a.horas)
        .slice(0, 5),
      alertasCalibracao: alertas.slice(0, 6).map((e) => ({
        id: e.id, nome: e.nome, patrimonio: e.patrimonio, laboratorioCodigo: e.laboratorio.codigo,
        proximaCalibracaoEm: e.proximaCalibracaoEm?.toISOString() ?? null, situacao: e.situacao,
      })),
      proximasReservas: proximas,
      atividade,
    };
}
