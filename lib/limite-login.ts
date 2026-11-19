/**
 * Limite de tentativas de login (contra força bruta) — regra pura, testada.
 * A contagem vem do banco (tabela tentativas_login), então funciona mesmo com várias instâncias do servidor.
 */
export const JANELA_MIN = 15;
export const MAX_FALHAS_EMAIL = 5;
export const MAX_FALHAS_IP = 20;

export type Contagem = {
  /** falhas deste e-mail na janela, desde o último login com sucesso */
  falhasEmail: number;
  /** falhas vindas deste IP na janela (qualquer e-mail) */
  falhasIp: number;
  /** horário da falha mais antiga que ainda conta (para calcular a espera) */
  primeiraFalha: Date | null;
};

export function avaliarTentativas(c: Contagem, agora: Date): { bloqueado: boolean; esperaMin: number } {
  const bloqueado = c.falhasEmail >= MAX_FALHAS_EMAIL || c.falhasIp >= MAX_FALHAS_IP;
  if (!bloqueado) return { bloqueado: false, esperaMin: 0 };
  const libera = c.primeiraFalha ? c.primeiraFalha.getTime() + JANELA_MIN * 60_000 : agora.getTime() + JANELA_MIN * 60_000;
  return { bloqueado: true, esperaMin: Math.max(1, Math.ceil((libera - agora.getTime()) / 60_000)) };
}
