import { beforeEach, describe, expect, it, vi } from "vitest";

const criadas: { dispositivoId: string; parametro: string }[] = [];
const pushes: string[] = [];
let prazoEm = new Date();

vi.mock("@/models/agente.model", () => ({
  AgenteModel: {
    alvosDoAgendador: async () => [{ id: "d1", hostname: "CEL-ANA", tipo: "SMARTPHONE", bloqueado: false }],
    contextoAutomacao: async () => ({ emprestimo: { id: "e1", prazoEm }, jaFeitas: new Set(criadas.map((c) => c.parametro)), ultimoBloqueio: null }),
    // simula o índice único parcial: o mesmo marcador não entra duas vezes
    criarAcaoSistema: async (dispositivoId: string, a: { parametro: string }) => {
      if (criadas.some((c) => c.dispositivoId === dispositivoId && c.parametro === a.parametro)) return null;
      criadas.push({ dispositivoId, parametro: a.parametro });
      return { id: `acao-${criadas.length}` };
    },
  },
}));
vi.mock("@/models/auditoria.model", () => ({ AuditoriaModel: { registrar: async () => {} } }));
vi.mock("@/lib/push", () => ({ notificarAparelho: async (id: string, n: { titulo: string }) => { pushes.push(`${id}:${n.titulo}`); } }));

const { varrerAutomacoes } = await import("@/lib/agendador");

describe("agendador do servidor (lembrete por push com o app fechado)", () => {
  const agora = new Date("2026-11-30T14:00:00-03:00");
  beforeEach(() => { criadas.length = 0; pushes.length = 0; });

  it("a 10 min do prazo cria o lembrete e manda push", async () => {
    prazoEm = new Date(agora.getTime() + 10 * 60_000);
    expect(await varrerAutomacoes(agora)).toBe(1);
    expect(criadas[0].parametro).toBe("auto:lembrete:e1");
    expect(pushes).toHaveLength(1);
  });

  it("não repete o lembrete na rodada seguinte", async () => {
    prazoEm = new Date(agora.getTime() + 10 * 60_000);
    await varrerAutomacoes(agora);
    expect(await varrerAutomacoes(new Date(agora.getTime() + 60_000))).toBe(0);
    expect(pushes).toHaveLength(1);
  });

  it("depois do prazo manda o aviso de atraso", async () => {
    prazoEm = new Date(agora.getTime() - 5 * 60_000);
    await varrerAutomacoes(agora);
    expect(criadas.map((c) => c.parametro)).toContain("auto:atraso:e1");
  });

  it("nunca trava aparelho (fechamento fica só no check-in)", async () => {
    prazoEm = new Date(agora.getTime() + 5 * 3_600_000);
    await varrerAutomacoes(new Date("2026-11-30T21:00:00-03:00"));
    expect(criadas.some((c) => c.parametro.startsWith("auto:fechamento"))).toBe(false);
  });
});
