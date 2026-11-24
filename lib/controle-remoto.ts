/**
 * Controle remoto — contas da tela do Líder (puras, sem nada de servidor: rodam no navegador).
 * Ver o fluxo completo em lib/tela-remota.ts.
 */

export type EventoTecla = { t: "k"; c: string; d: boolean };

/**
 * Onde o ponteiro caiu sobre a imagem da tela, de 0 a 1 em cada eixo. A imagem é mostrada com
 * object-contain (sobram faixas pretas dos lados ou em cima/embaixo): clique na faixa = null.
 */
export function pontoNaImagem(
  clienteX: number, clienteY: number,
  caixa: { left: number; top: number; width: number; height: number },
  natural: { w: number; h: number },
): { x: number; y: number } | null {
  if (!(natural.w > 0 && natural.h > 0 && caixa.width > 0 && caixa.height > 0)) return null;
  const escala = Math.min(caixa.width / natural.w, caixa.height / natural.h);
  const largura = natural.w * escala, altura = natural.h * escala;
  const x = (clienteX - (caixa.left + (caixa.width - largura) / 2)) / largura;
  const y = (clienteY - (caixa.top + (caixa.height - altura) / 2)) / altura;
  if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return null;
  return { x: Math.round(x * 10_000) / 10_000, y: Math.round(y * 10_000) / 10_000 };
}

/** Roda do mouse → pixels, qualquer que seja a unidade que o navegador usou (pixel, linha, página). */
export function pixelsDaRoda(deltaY: number, deltaMode: number) {
  return deltaMode === 1 ? deltaY * 40 : deltaMode === 2 ? deltaY * 800 : deltaY;
}

/** ~100 px de roda = 1 "degrau" (um clique da roda). Devolve os degraus inteiros e o que sobrou. */
export function degrausDaRoda(acumulado: number) {
  const degraus = Math.max(-20, Math.min(20, Math.trunc(acumulado / 100)));
  return { degraus, resto: acumulado - degraus * 100 };
}

/** Atalhos que o navegador do Líder engole (tecla Windows, Alt+Tab…): viram botões. */
export const ATALHOS = {
  windows: { nome: "Tecla Windows", teclas: ["MetaLeft"] },
  altTab: { nome: "Alt+Tab", teclas: ["AltLeft", "Tab"] },
  tarefas: { nome: "Gerenciador de Tarefas", teclas: ["ControlLeft", "ShiftLeft", "Escape"] },
  area: { nome: "Mostrar a área de trabalho", teclas: ["MetaLeft", "KeyD"] },
} as const;

/** Aperta as teclas na ordem e solta na ordem inversa (Ctrl, Shift, Esc → solta Esc, Shift, Ctrl). */
export function sequenciaAtalho(teclas: readonly string[]): EventoTecla[] {
  return [...teclas.map((c) => ({ t: "k" as const, c, d: true })), ...[...teclas].reverse().map((c) => ({ t: "k" as const, c, d: false }))];
}
