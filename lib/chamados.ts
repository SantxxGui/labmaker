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

/** Descrição do chamado aberto pelo atalho, antes de a pessoa escrever: a primeira mensagem vira a descrição. */
export const DESCRICAO_ATALHO = "Pediu ajuda pelo atalho (conta o problema no chat)";

/** A janelinha de chat avisa o servidor a cada 2 s; sem aviso por mais que isto, ela foi fechada. */
export const JANELA_AJUDA_VIVA_MS = 8_000;

export function janelaAjudaAberta(ultimoSinal: number | undefined, agora = Date.now()) {
  return ultimoSinal !== undefined && agora - ultimoSinal < JANELA_AJUDA_VIVA_MS;
}

// Último sinal de cada janelinha (em memória; reiniciar o servidor só faz o agente reabrir a janela)
const g = globalThis as unknown as { __labmakerJanelasAjuda?: Map<string, number> };
const sinais = (g.__labmakerJanelasAjuda ??= new Map<string, number>());
export const JanelaAjuda = {
  marcar: (dispositivoId: string, agora = Date.now()) => void sinais.set(dispositivoId, agora),
  aberta: (dispositivoId: string, agora = Date.now()) => janelaAjudaAberta(sinais.get(dispositivoId), agora),
};
