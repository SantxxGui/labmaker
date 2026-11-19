/** Chamados (pedidos de ajuda) — regras puras do ciclo de vida (testadas em tests/chamados.test.ts). */
import type { StatusChamado } from "@/lib/types";

export const CHECKIN_ATENDIMENTO_S = 3; // com chamado aberto, o aparelho faz check-in a cada 3 s (chat fluido)

export function transicaoChamado(atual: StatusChamado, acao: "atender" | "resolver" | "cancelar"): { ok: true; status: StatusChamado } | { ok: false; motivo: string } {
  const fechado = atual === "RESOLVIDO" || atual === "CANCELADO";
  if (fechado) return { ok: false, motivo: "Este chamado já foi encerrado." };
  if (acao === "atender") return atual === "ABERTO" ? { ok: true, status: "EM_ATENDIMENTO" } : { ok: false, motivo: "O chamado já está em atendimento." };
  if (acao === "resolver") return { ok: true, status: "RESOLVIDO" };
  return { ok: true, status: "CANCELADO" };
}

/** A sessão de tela de um chamado pode pular a janela "Permitir/Recusar"? Só se o próprio usuário autorizou ao abrir. */
export const parametroTelaDoChamado = (chamadoId: string, preAutorizado: boolean) => `chamado:${chamadoId}${preAutorizado ? ":pre-autorizado" : ""}`;
