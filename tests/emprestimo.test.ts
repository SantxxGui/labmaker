import { describe, expect, it } from "vitest";
import { PRAZO_MAXIMO_DIAS, avaliarEmprestimo, situacaoEmprestimo } from "@/lib/emprestimo";

const agora = new Date("2026-11-30T13:00:00Z");
const h = (n: number) => new Date(agora.getTime() + n * 3_600_000);
const base = {
  dispositivo: { tipo: "NOTEBOOK" as const, ativo: true, bloqueado: false, emprestado: false },
  aluno: { ativo: true, abertos: 0 },
  prazoEm: h(4),
  agora,
};

describe("Empréstimo de notebooks", () => {
  it("empresta quando tudo está em ordem", () => {
    expect(avaliarEmprestimo(base)).toEqual({ ok: true });
  });
  it("não empresta aparelho que já está com alguém", () => {
    expect(avaliarEmprestimo({ ...base, dispositivo: { ...base.dispositivo, emprestado: true } })).toMatchObject({ ok: false });
  });
  it("não empresta estação fixa de máquina nem aparelho bloqueado ou desativado", () => {
    expect(avaliarEmprestimo({ ...base, dispositivo: { ...base.dispositivo, tipo: "DESKTOP" } }).ok).toBe(false);
    expect(avaliarEmprestimo({ ...base, dispositivo: { ...base.dispositivo, bloqueado: true } }).ok).toBe(false);
    expect(avaliarEmprestimo({ ...base, dispositivo: { ...base.dispositivo, ativo: false } }).ok).toBe(false);
  });
  it("um aparelho por aluno, e só para conta ativa", () => {
    expect(avaliarEmprestimo({ ...base, aluno: { ativo: true, abertos: 1 } })).toMatchObject({ ok: false, motivo: expect.stringMatching(/já está com um/) });
    expect(avaliarEmprestimo({ ...base, aluno: { ativo: false, abertos: 0 } }).ok).toBe(false);
  });
  it(`prazo entre 15 minutos e ${PRAZO_MAXIMO_DIAS} dias`, () => {
    expect(avaliarEmprestimo({ ...base, prazoEm: h(0.1) }).ok).toBe(false);
    expect(avaliarEmprestimo({ ...base, prazoEm: h(PRAZO_MAXIMO_DIAS * 24 + 1) }).ok).toBe(false);
    expect(avaliarEmprestimo({ ...base, prazoEm: h(PRAZO_MAXIMO_DIAS * 24 - 1) }).ok).toBe(true);
  });
  it("situação: aberto, atrasado e devolvido", () => {
    expect(situacaoEmprestimo({ prazoEm: h(1), devolvidoEm: null }, agora)).toBe("ABERTO");
    expect(situacaoEmprestimo({ prazoEm: h(-1), devolvidoEm: null }, agora)).toBe("ATRASADO");
    expect(situacaoEmprestimo({ prazoEm: h(-1), devolvidoEm: h(-2) }, agora)).toBe("DEVOLVIDO");
  });
});
