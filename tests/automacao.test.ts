import { describe, expect, it } from "vitest";
import { automacoesDoCheckin, espacoAberto, relogioDoEspaco } from "@/lib/automacao";

// 30/11/2026 é segunda-feira. 17:00Z = 14:00 no espaço; 23:30Z = 20:30 (fechado)
const tarde = new Date("2026-11-30T17:00:00Z");
const noite = new Date("2026-11-30T23:30:00Z");
const base = {
  dispositivo: { hostname: "LM-NB-01", tipo: "NOTEBOOK" as const, bloqueado: false },
  politica: { bloquearForaHorario: true },
  emprestimo: null as { id: string; prazoEm: Date } | null,
  jaFeitas: new Set<string>(),
  ultimoBloqueio: null as string | null,
};
const min = (d: Date, n: number) => new Date(d.getTime() + n * 60_000);

describe("Relógio do espaço", () => {
  it("usa o fuso de Brasília", () => {
    expect(relogioDoEspaco(tarde)).toEqual({ data: "2026-11-30", minutos: 14 * 60 });
    expect(relogioDoEspaco(new Date("2026-12-01T01:00:00Z")).data).toBe("2026-11-30"); // 22h do dia 30
  });
  it("aberto das 8h às 20h, fechado aos domingos", () => {
    expect(espacoAberto(tarde)).toBe(true);
    expect(espacoAberto(noite)).toBe(false);
    expect(espacoAberto(new Date("2026-11-29T17:00:00Z"))).toBe(false); // domingo
  });
});

describe("Lembrete e atraso de empréstimo", () => {
  it("avisa 15 min antes do prazo, uma vez só", () => {
    const e = { id: "em1", prazoEm: min(tarde, 10) };
    const [a] = automacoesDoCheckin({ ...base, politica: null, agora: tarde, emprestimo: e });
    expect(a).toMatchObject({ tipo: "ALERTA", parametro: "auto:lembrete:em1", titulo: "Devolução em 10 min" });
    expect(a.mensagem).toContain("até 14:10");
    expect(automacoesDoCheckin({ ...base, politica: null, agora: tarde, emprestimo: e, jaFeitas: new Set(["auto:lembrete:em1"]) })).toEqual([]);
  });
  it("não avisa cedo demais", () => {
    expect(automacoesDoCheckin({ ...base, politica: null, agora: tarde, emprestimo: { id: "em1", prazoEm: min(tarde, 40) } })).toEqual([]);
  });
  it("prazo vencido → aviso crítico de atraso", () => {
    expect(automacoesDoCheckin({ ...base, politica: null, agora: tarde, emprestimo: { id: "em1", prazoEm: min(tarde, -5) } })[0]).toMatchObject({ parametro: "auto:atraso:em1", prioridade: "CRITICO" });
  });
});

describe("Fechamento e abertura automáticos", () => {
  it("trava depois das 20h, uma vez por dia", () => {
    expect(automacoesDoCheckin({ ...base, agora: noite })).toEqual([expect.objectContaining({ tipo: "BLOQUEAR", parametro: "auto:fechamento:2026-11-30" })]);
    expect(automacoesDoCheckin({ ...base, agora: noite, jaFeitas: new Set(["auto:fechamento:2026-11-30"]) })).toEqual([]);
  });
  it("não trava durante o dia, sem a política, emprestado ou celular", () => {
    expect(automacoesDoCheckin({ ...base, agora: tarde })).toEqual([]);
    expect(automacoesDoCheckin({ ...base, agora: noite, politica: { bloquearForaHorario: false } })).toEqual([]);
    expect(automacoesDoCheckin({ ...base, agora: noite, politica: null })).toEqual([]);
    expect(automacoesDoCheckin({ ...base, agora: noite, dispositivo: { ...base.dispositivo, tipo: "SMARTPHONE" } })).toEqual([]);
    expect(automacoesDoCheckin({ ...base, agora: noite, emprestimo: { id: "em1", prazoEm: min(noite, 600) } }).some((a) => a.tipo === "BLOQUEAR")).toBe(false);
  });
  it("destrava na abertura só o que a automação travou antes de hoje", () => {
    const manha = new Date("2026-12-01T11:05:00Z"); // 08:05 do dia 1º
    const travado = { ...base.dispositivo, bloqueado: true };
    expect(automacoesDoCheckin({ ...base, agora: manha, dispositivo: travado, ultimoBloqueio: "auto:fechamento:2026-11-30" })).toEqual([expect.objectContaining({ tipo: "DESBLOQUEAR", parametro: "auto:abertura:2026-12-01" })]);
    // bloqueio manual do Líder ou teste feito hoje: continua travado
    expect(automacoesDoCheckin({ ...base, agora: manha, dispositivo: travado, ultimoBloqueio: null })).toEqual([]);
    expect(automacoesDoCheckin({ ...base, agora: manha, dispositivo: travado, ultimoBloqueio: "auto:teste:123" })).toEqual([]);
  });
});
