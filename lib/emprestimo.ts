/**
 * Empréstimo de notebooks/tablets do espaço — regras puras (testadas em tests/emprestimo.test.ts).
 * O banco reforça a principal: índice único parcial impede dois empréstimos abertos do mesmo aparelho.
 */
import type { TipoDispositivo } from "@/lib/types";

export const MAX_EMPRESTIMOS_POR_ALUNO = 1;
export const PRAZO_MAXIMO_DIAS = 7;
const MIN = 60_000;

export type SituacaoEmprestimo = "ABERTO" | "ATRASADO" | "DEVOLVIDO";

export function situacaoEmprestimo(e: { prazoEm: Date | string; devolvidoEm: Date | string | null }, agora = new Date()): SituacaoEmprestimo {
  if (e.devolvidoEm) return "DEVOLVIDO";
  return new Date(e.prazoEm).getTime() < agora.getTime() ? "ATRASADO" : "ABERTO";
}

export function avaliarEmprestimo(c: {
  dispositivo: { tipo: TipoDispositivo; ativo: boolean; bloqueado: boolean; emprestado: boolean };
  aluno: { ativo: boolean; abertos: number };
  prazoEm: Date;
  agora?: Date;
}): { ok: true } | { ok: false; motivo: string } {
  const agora = c.agora ?? new Date();
  if (!c.dispositivo.ativo) return { ok: false, motivo: "Dispositivo desativado." };
  if (c.dispositivo.tipo === "DESKTOP") return { ok: false, motivo: "Estações fixas das máquinas não são emprestadas." };
  if (c.dispositivo.emprestado) return { ok: false, motivo: "Este aparelho já está emprestado." };
  if (c.dispositivo.bloqueado) return { ok: false, motivo: "Aparelho bloqueado: desbloqueie antes de emprestar." };
  if (!c.aluno.ativo) return { ok: false, motivo: "A conta do aluno está desativada." };
  if (c.aluno.abertos >= MAX_EMPRESTIMOS_POR_ALUNO) return { ok: false, motivo: "O aluno já está com um aparelho emprestado." };
  if (c.prazoEm.getTime() < agora.getTime() + 15 * MIN) return { ok: false, motivo: "O prazo precisa ser de pelo menos 15 minutos." };
  if (c.prazoEm.getTime() > agora.getTime() + PRAZO_MAXIMO_DIAS * 24 * 60 * MIN) return { ok: false, motivo: `Prazo máximo de ${PRAZO_MAXIMO_DIAS} dias.` };
  return { ok: true };
}
