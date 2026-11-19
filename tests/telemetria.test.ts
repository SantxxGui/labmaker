import { describe, expect, it } from "vitest";
import { avaliarComando, estadoEfetivo, lerTelemetria, serieRecente, type MaquinaParaLeitura } from "@/lib/telemetria";

const AGORA = new Date("2026-11-16T14:00:00-03:00");
const cnc = (extra: Partial<MaquinaParaLeitura> = {}): MaquinaParaLeitura => ({
  id: "eq_cnc", tipo: "USINAGEM_CNC", status: "LIVRE", estadoMaquina: "OPERANDO", ultimoContatoEm: AGORA, alarmeAtivo: null, ...extra,
});

describe("lerTelemetria", () => {
  it("é determinística: mesmo instante, mesma leitura", () => {
    expect(lerTelemetria(cnc(), AGORA)).toEqual(lerTelemetria(cnc(), AGORA));
  });

  it("em operação, as métricas ficam dentro da faixa e há programa em execução", () => {
    const l = lerTelemetria(cnc(), AGORA);
    expect(l.online).toBe(true);
    expect(l.programa).toBeTruthy();
    expect(l.progresso).toBeGreaterThanOrEqual(0);
    expect(l.metricas.every((m) => !m.alerta)).toBe(true);
    expect(l.metricas.find((m) => m.chave === "rpm")!.valor).toBeGreaterThan(5000);
  });

  it("ociosa: fuso parado e sem programa", () => {
    const l = lerTelemetria(cnc({ estadoMaquina: "OCIOSO" }), AGORA);
    expect(l.programa).toBeNull();
    expect(Math.abs(l.metricas.find((m) => m.chave === "rpm")!.valor!)).toBeLessThan(100);
  });

  it("alarme crítico leva a métrica de falha para fora da faixa", () => {
    const l = lerTelemetria(cnc({ estadoMaquina: "ALARME", alarmeAtivo: { codigo: "E-2041", mensagem: "Sobrecorrente", severidade: "CRITICO" } }), AGORA);
    expect(l.metricas.find((m) => m.chave === "carga")!.alerta).toBe(true);
  });

  it("offline: sem valores e sem latência", () => {
    const l = lerTelemetria(cnc({ estadoMaquina: "OFFLINE" }), AGORA);
    expect(l.online).toBe(false);
    expect(l.latenciaMs).toBeNull();
    expect(l.metricas.every((m) => m.valor === null)).toBe(true);
  });

  it("manutenção tem prioridade sobre o estado físico (exceto offline)", () => {
    expect(estadoEfetivo({ status: "MANUTENCAO", estadoMaquina: "ALARME" })).toBe("MANUTENCAO");
    expect(estadoEfetivo({ status: "MANUTENCAO", estadoMaquina: "OFFLINE" })).toBe("OFFLINE");
  });

  it("a série recente termina na leitura atual", () => {
    const serie = serieRecente(cnc(), AGORA, 10);
    expect(serie.rpm).toHaveLength(10);
    expect(serie.rpm.at(-1)).toBe(lerTelemetria(cnc(), AGORA).metricas[0].valor);
  });
});

describe("avaliarComando (segurança)", () => {
  const base = { status: "LIVRE" as const, alarmes: [] as { severidade: "INFO" | "AVISO" | "CRITICO"; reconhecido: boolean }[] };

  it("máquina offline nunca recebe comando", () => {
    expect(avaliarComando({ ...base, tipo: "PARAR_CICLO", estado: "OFFLINE" })).toMatchObject({ ok: false });
  });
  it("pausar só em ciclo; retomar só se pausada", () => {
    expect(avaliarComando({ ...base, tipo: "PAUSAR", estado: "OPERANDO" })).toEqual({ ok: true, novoEstado: "PAUSADO", reconhecerAlarmes: false });
    expect(avaliarComando({ ...base, tipo: "PAUSAR", estado: "OCIOSO" })).toMatchObject({ ok: false });
    expect(avaliarComando({ ...base, tipo: "RETOMAR", estado: "PAUSADO" })).toMatchObject({ ok: true, novoEstado: "OPERANDO" });
    expect(avaliarComando({ ...base, tipo: "RETOMAR", estado: "OCIOSO" })).toMatchObject({ ok: false });
  });
  it("não retoma remotamente com alarme crítico ativo (exige inspeção local)", () => {
    const r = avaliarComando({ ...base, tipo: "RETOMAR", estado: "PAUSADO", alarmes: [{ severidade: "CRITICO", reconhecido: true }] });
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.motivo).toMatch(/NR-12/);
  });
  it("parar ciclo funciona mesmo em manutenção e em alarme", () => {
    expect(avaliarComando({ ...base, status: "MANUTENCAO", tipo: "PARAR_CICLO", estado: "ALARME" })).toMatchObject({ ok: true, novoEstado: "OCIOSO" });
  });
  it("em manutenção, comandos que movimentam são bloqueados", () => {
    expect(avaliarComando({ ...base, status: "MANUTENCAO", tipo: "RETOMAR", estado: "PAUSADO" })).toMatchObject({ ok: false });
  });
  it("reconhecer exige alarme pendente", () => {
    expect(avaliarComando({ ...base, tipo: "RECONHECER_ALARMES", estado: "ALARME", alarmes: [{ severidade: "AVISO", reconhecido: false }] })).toMatchObject({ ok: true, reconhecerAlarmes: true });
    expect(avaliarComando({ ...base, tipo: "RECONHECER_ALARMES", estado: "ALARME", alarmes: [{ severidade: "AVISO", reconhecido: true }] })).toMatchObject({ ok: false });
  });
});

describe("sem falsos alertas", () => {
  it("nenhuma máquina sem alarme reporta métrica fora da faixa, em qualquer estado", () => {
    const tipos = ["USINAGEM_CNC", "CORTE_LASER", "MANUFATURA_ADITIVA", "METROLOGIA", "ENSAIO_MATERIAIS", "CAMARA_CLIMATICA", "ELETRONICA", "ANALISE_QUIMICA"] as const;
    for (const tipo of tipos)
      for (const estadoMaquina of ["OPERANDO", "OCIOSO", "PAUSADO"] as const)
        for (let k = 0; k < 30; k++) {
          const l = lerTelemetria({ id: `m-${tipo}`, tipo, status: "LIVRE", estadoMaquina, ultimoContatoEm: null, alarmeAtivo: null }, new Date(AGORA.getTime() + k * 7919));
          expect(l.metricas.filter((m) => m.alerta)).toEqual([]);
        }
  });
});
