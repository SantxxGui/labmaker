import { describe, expect, it } from "vitest";
import { JANELA_MIN, MAX_FALHAS_EMAIL, MAX_FALHAS_IP, avaliarTentativas } from "@/lib/limite-login";

const agora = new Date("2026-11-30T13:00:00Z");
const min = (n: number) => new Date(agora.getTime() - n * 60_000);

describe("Limite de tentativas de login", () => {
  it("libera abaixo do limite", () => {
    expect(avaliarTentativas({ falhasEmail: MAX_FALHAS_EMAIL - 1, falhasIp: 0, primeiraFalha: min(3) }, agora).bloqueado).toBe(false);
  });
  it(`bloqueia na ${MAX_FALHAS_EMAIL}ª falha do mesmo e-mail`, () => {
    expect(avaliarTentativas({ falhasEmail: MAX_FALHAS_EMAIL, falhasIp: 0, primeiraFalha: min(3) }, agora)).toEqual({ bloqueado: true, esperaMin: JANELA_MIN - 3 });
  });
  it("bloqueia um IP que tenta muitos e-mails diferentes (credential stuffing)", () => {
    expect(avaliarTentativas({ falhasEmail: 0, falhasIp: MAX_FALHAS_IP, primeiraFalha: min(10) }, agora).bloqueado).toBe(true);
  });
  it("a espera nunca é menor que 1 minuto", () => {
    expect(avaliarTentativas({ falhasEmail: MAX_FALHAS_EMAIL, falhasIp: 0, primeiraFalha: min(JANELA_MIN) }, agora).esperaMin).toBe(1);
  });
});
