import { describe, expect, it } from "vitest";
import { PRAZO_MAXIMO_DIAS, alarmeDevolucao, avaliarEmprestimo, repetirNotificacaoAlarme, situacaoEmprestimo } from "@/lib/emprestimo";

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

describe("alarme de devolução", () => {
  const prazo = new Date("2026-11-30T13:00:00Z"); // 10:00 em São Paulo
  it("não toca até 10:00:59 e toca a partir de 10:01", () => {
    expect(alarmeDevolucao({ prazoEm: prazo }, new Date("2026-11-30T13:00:59Z")).tocando).toBe(false);
    expect(alarmeDevolucao({ prazoEm: prazo }, new Date("2026-11-30T13:01:00Z")).tocando).toBe(true);
    expect(alarmeDevolucao({ prazoEm: prazo }).alarmeEm.toISOString()).toBe("2026-11-30T13:01:00.000Z");
  });
  it("com a página fechada, notifica a cada minuto nos primeiros 15 min e depois a cada 5", () => {
    const al = new Date("2026-11-30T13:01:00Z");
    const em = (min: number) => repetirNotificacaoAlarme(al, new Date(al.getTime() + min * 60_000 + 20_000));
    expect(repetirNotificacaoAlarme(al, new Date(al.getTime() - 30_000))).toBe(false);
    expect([0, 1, 7, 14].every(em)).toBe(true);
    expect([16, 17, 21, 33].some(em)).toBe(false);
    expect([15, 20, 25, 60].every(em)).toBe(true);
  });
});
