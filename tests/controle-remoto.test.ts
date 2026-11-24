import { describe, expect, it } from "vitest";
import { ATALHOS, degrausDaRoda, pixelsDaRoda, pontoNaImagem, sequenciaAtalho } from "@/lib/controle-remoto";

describe("controle remoto — onde o Líder clicou", () => {
  // caixa 16:9 de 1600×900; tela do aluno 1280×1024 (5:4) → faixas pretas dos lados
  const caixa = { left: 100, top: 50, width: 1600, height: 900 };
  const natural = { w: 1280, h: 1024 };
  // escala = min(1600/1280, 900/1024) = 0,8789 → imagem de 1125×900 começando em x = 100 + 237,5
  it("o canto de cima à esquerda da imagem é (0, 0) e o de baixo à direita é (1, 1)", () => {
    expect(pontoNaImagem(337.5, 50, caixa, natural)).toEqual({ x: 0, y: 0 });
    expect(pontoNaImagem(1462.5, 950, caixa, natural)).toEqual({ x: 1, y: 1 });
    expect(pontoNaImagem(900, 500, caixa, natural)).toEqual({ x: 0.5, y: 0.5 });
  });
  it("clique na faixa preta não vai para o computador", () => {
    expect(pontoNaImagem(200, 500, caixa, natural)).toBeNull();
    expect(pontoNaImagem(1600, 500, caixa, natural)).toBeNull();
  });
  it("imagem ainda não carregada não gera clique", () => {
    expect(pontoNaImagem(900, 500, caixa, { w: 0, h: 0 })).toBeNull();
  });
});

describe("controle remoto — roda e atalhos", () => {
  it("roda: linhas e páginas viram pixels; 100 px = 1 degrau, o resto fica para depois", () => {
    expect(pixelsDaRoda(3, 1)).toBe(120);
    expect(pixelsDaRoda(1, 2)).toBe(800);
    expect(degrausDaRoda(250)).toEqual({ degraus: 2, resto: 50 });
    expect(degrausDaRoda(-120)).toEqual({ degraus: -1, resto: -20 });
    expect(degrausDaRoda(99)).toEqual({ degraus: 0, resto: 99 });
    expect(degrausDaRoda(10_000).degraus).toBe(20);
  });
  it("Gerenciador de Tarefas = Ctrl+Shift+Esc, soltando na ordem inversa", () => {
    expect(sequenciaAtalho(ATALHOS.tarefas.teclas).map((e) => `${e.c}${e.d ? "↓" : "↑"}`)).toEqual(["ControlLeft↓", "ShiftLeft↓", "Escape↓", "Escape↑", "ShiftLeft↑", "ControlLeft↑"]);
  });
});
