/**
 * Regras de funcionamento dos laboratórios, geração de slots e calibração.
 * Funções puras (sem banco) — cobertas por testes em tests/.
 * Tudo é calculado no fuso de São Paulo (UTC-03:00, sem horário de verão desde 2019).
 */

export const LAB = {
  abertura: 8, // 08:00
  fechamento: 20, // 20:00
  diasFechados: [0] as number[], // 0 = domingo
  janelaDias: 30, // agendamento até 30 dias à frente
  maxReservasAtivas: 4, // por usuário comum (reservas futuras confirmadas)
  alertaCalibracaoDias: 30, // "a vencer" quando faltam até 30 dias
  utcOffset: "-03:00",
} as const;

export type Slot = {
  inicio: string; // ISO
  fim: string; // ISO
  label: string; // "08:00"
  disponivel: boolean;
  motivo: "ocupado" | "passado" | "meu" | null;
};

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDataValida(data: string) {
  if (!DATA_RE.test(data)) return false;
  const d = new Date(`${data}T12:00:00${LAB.utcOffset}`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
}

/** Converte "YYYY-MM-DD" + hora/min local do lab em Date (UTC). */
export function horarioLocal(data: string, minutosDoDia: number) {
  const h = String(Math.floor(minutosDoDia / 60)).padStart(2, "0");
  const m = String(minutosDoDia % 60).padStart(2, "0");
  return new Date(`${data}T${h}:${m}:00${LAB.utcOffset}`);
}

/** Dia da semana (0-6) de uma data "YYYY-MM-DD" no fuso do lab. */
export function diaDaSemana(data: string) {
  return new Date(`${data}T12:00:00${LAB.utcOffset}`).getUTCDay();
}

/** "Hoje" no fuso do lab, como YYYY-MM-DD. */
export function hojeNoLab(now = new Date()) {
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

export function diferencaEmDias(de: string, ate: string) {
  const a = new Date(`${de}T00:00:00Z`).getTime();
  const b = new Date(`${ate}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Motivo pelo qual o lab não abre numa data (ou null se abre). */
export function motivoDataBloqueada(data: string, now = new Date()): string | null {
  if (!isDataValida(data)) return "Data inválida.";
  const dias = diferencaEmDias(hojeNoLab(now), data);
  if (dias < 0) return "Não é possível agendar em datas passadas.";
  if (dias > LAB.janelaDias) return `Agendamentos abertos até ${LAB.janelaDias} dias à frente.`;
  if ((LAB.diasFechados as number[]).includes(diaDaSemana(data))) {
    return "O laboratório não abre aos domingos.";
  }
  return null;
}

type Intervalo = { inicio: Date; fim: Date; usuarioId?: string };

export function sobrepoe(a: { inicio: Date; fim: Date }, b: { inicio: Date; fim: Date }) {
  return a.inicio < b.fim && b.inicio < a.fim;
}

/** Gera a grade de slots de um dia, marcando ocupados/passados. */
export function gerarSlots(params: {
  data: string;
  duracaoMin: number;
  ocupados: Intervalo[];
  usuarioId?: string;
  now?: Date;
}): Slot[] {
  const { data, duracaoMin, ocupados, usuarioId, now = new Date() } = params;
  const slots: Slot[] = [];

  for (
    let min = LAB.abertura * 60;
    min + duracaoMin <= LAB.fechamento * 60;
    min += duracaoMin
  ) {
    const inicio = horarioLocal(data, min);
    const fim = new Date(inicio.getTime() + duracaoMin * 60_000);
    const conflito = ocupados.find((o) => sobrepoe({ inicio, fim }, o));

    let motivo: Slot["motivo"] = null;
    if (conflito) motivo = usuarioId && conflito.usuarioId === usuarioId ? "meu" : "ocupado";
    else if (inicio <= now) motivo = "passado";

    slots.push({
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      label: `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`,
      disponivel: motivo === null,
      motivo,
    });
  }
  return slots;
}

/** Chave YYYY-MM-DD de um instante, no fuso do lab. */
export function diaNoLab(d: Date | string) {
  return hojeNoLab(new Date(d));
}

export type SituacaoCalibracao = "NAO_APLICAVEL" | "EM_DIA" | "A_VENCER" | "VENCIDA" | "PENDENTE";

/** Situação da calibração de um equipamento num dado instante. */
export function situacaoCalibracao(
  e: { requerCalibracao: boolean; proximaCalibracaoEm: Date | string | null },
  now = new Date(),
): SituacaoCalibracao {
  if (!e.requerCalibracao) return "NAO_APLICAVEL";
  if (!e.proximaCalibracaoEm) return "PENDENTE";
  const venc = new Date(e.proximaCalibracaoEm).getTime();
  if (venc < now.getTime()) return "VENCIDA";
  if (venc - now.getTime() <= LAB.alertaCalibracaoDias * 86_400_000) return "A_VENCER";
  return "EM_DIA";
}

/** Calibração vencida ou nunca feita impede novas reservas. */
export function bloqueadoPorCalibracao(s: SituacaoCalibracao) {
  return s === "VENCIDA" || s === "PENDENTE";
}

/** Valida se um início pedido cai exatamente numa fronteira de slot. */
export function isInicioDeSlot(inicio: Date, duracaoMin: number) {
  const local = new Date(inicio.getTime() - 3 * 60 * 60 * 1000);
  const minutos = local.getUTCHours() * 60 + local.getUTCMinutes();
  const data = local.toISOString().slice(0, 10);
  const dentroDoHorario =
    minutos >= LAB.abertura * 60 && minutos + duracaoMin <= LAB.fechamento * 60;
  const alinhado = (minutos - LAB.abertura * 60) % duracaoMin === 0;
  return { valido: dentroDoHorario && alinhado && local.getUTCSeconds() === 0, data };
}
