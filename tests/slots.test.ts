import { describe, expect, it } from "vitest";
import {
  LAB, bloqueadoPorCalibracao, gerarSlots, hojeNoLab, isDataValida, isInicioDeSlot,
  motivoDataBloqueada, situacaoCalibracao, sobrepoe,
} from "@/lib/slots";

// Segunda-feira, 16/11/2026, 10:30 em São Paulo
const AGORA = new Date("2026-11-16T10:30:00-03:00");
const em = (iso: string) => new Date(`${iso}-03:00`);

describe("gerarSlots", () => {
  it("gera a grade 08h–20h no tamanho do slot do equipamento", () => {
    const slots = gerarSlots({ data: "2026-11-17", duracaoMin: 120, ocupados: [], now: AGORA });
    expect(slots.map((s) => s.label)).toEqual(["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"]);
    expect(slots.every((s) => s.disponivel)).toBe(true);
  });

  it("não cria slot que ultrapasse o fechamento (90 min → último às 18:30)", () => {
    const slots = gerarSlots({ data: "2026-11-17", duracaoMin: 90, ocupados: [], now: AGORA });
    expect(slots).toHaveLength(8);
    expect(slots.at(-1)!.label).toBe("18:30");
  });

  it("marca ocupado, 'meu' e passado", () => {
    const slots = gerarSlots({
      data: "2026-11-16", duracaoMin: 60, usuarioId: "eu", now: AGORA,
      ocupados: [
        { inicio: em("2026-11-16T14:00:00"), fim: em("2026-11-16T15:00:00"), usuarioId: "outro" },
        { inicio: em("2026-11-16T16:00:00"), fim: em("2026-11-16T17:00:00"), usuarioId: "eu" },
      ],
    });
    const por = Object.fromEntries(slots.map((s) => [s.label, s.motivo]));
    expect(por["09:00"]).toBe("passado");
    expect(por["10:00"]).toBe("passado"); // já começou
    expect(por["11:00"]).toBeNull();
    expect(por["14:00"]).toBe("ocupado");
    expect(por["16:00"]).toBe("meu");
  });

  it("uma reserva longa bloqueia todos os slots menores que ela cobre", () => {
    const slots = gerarSlots({
      data: "2026-11-17", duracaoMin: 30, now: AGORA,
      ocupados: [{ inicio: em("2026-11-17T09:00:00"), fim: em("2026-11-17T10:00:00") }],
    });
    expect(slots.filter((s) => s.motivo === "ocupado").map((s) => s.label)).toEqual(["09:00", "09:30"]);
  });
});

describe("sobrepoe", () => {
  const a = { inicio: em("2026-11-17T10:00:00"), fim: em("2026-11-17T12:00:00") };
  it("intervalos encostados não conflitam", () => {
    expect(sobrepoe(a, { inicio: em("2026-11-17T12:00:00"), fim: em("2026-11-17T14:00:00") })).toBe(false);
  });
  it("qualquer interseção conflita", () => {
    expect(sobrepoe(a, { inicio: em("2026-11-17T11:59:00"), fim: em("2026-11-17T13:00:00") })).toBe(true);
  });
});

describe("regras de data", () => {
  it("valida o formato e datas impossíveis", () => {
    expect(isDataValida("2026-11-17")).toBe(true);
    expect(isDataValida("2026-02-30")).toBe(false);
    expect(isDataValida("17/11/2026")).toBe(false);
  });
  it("bloqueia passado, domingo e além da janela", () => {
    expect(motivoDataBloqueada("2026-11-15", AGORA)).toMatch(/passadas/);
    expect(motivoDataBloqueada("2026-11-22", AGORA)).toMatch(/domingos/);
    expect(motivoDataBloqueada("2027-01-10", AGORA)).toMatch(new RegExp(`${LAB.janelaDias} dias`));
    expect(motivoDataBloqueada("2026-11-17", AGORA)).toBeNull();
  });
  it("'hoje' respeita o fuso de São Paulo (23h local ainda é o mesmo dia)", () => {
    expect(hojeNoLab(new Date("2026-11-17T01:30:00Z"))).toBe("2026-11-16");
  });
  it("só aceita início alinhado à grade", () => {
    expect(isInicioDeSlot(em("2026-11-17T10:00:00"), 120).valido).toBe(true);
    expect(isInicioDeSlot(em("2026-11-17T09:00:00"), 120).valido).toBe(false); // desalinhado
    expect(isInicioDeSlot(em("2026-11-17T19:00:00"), 120).valido).toBe(false); // passaria das 20h
    expect(isInicioDeSlot(em("2026-11-17T07:00:00"), 60).valido).toBe(false); // antes de abrir
  });
});

describe("calibração", () => {
  const dias = (n: number) => new Date(AGORA.getTime() + n * 86_400_000);
  it("classifica a situação pelo vencimento", () => {
    expect(situacaoCalibracao({ requerCalibracao: false, proximaCalibracaoEm: null }, AGORA)).toBe("NAO_APLICAVEL");
    expect(situacaoCalibracao({ requerCalibracao: true, proximaCalibracaoEm: null }, AGORA)).toBe("PENDENTE");
    expect(situacaoCalibracao({ requerCalibracao: true, proximaCalibracaoEm: dias(-1) }, AGORA)).toBe("VENCIDA");
    expect(situacaoCalibracao({ requerCalibracao: true, proximaCalibracaoEm: dias(12) }, AGORA)).toBe("A_VENCER");
    expect(situacaoCalibracao({ requerCalibracao: true, proximaCalibracaoEm: dias(200) }, AGORA)).toBe("EM_DIA");
  });
  it("vencida e pendente bloqueiam reservas; a vencer não", () => {
    expect(bloqueadoPorCalibracao("VENCIDA")).toBe(true);
    expect(bloqueadoPorCalibracao("PENDENTE")).toBe(true);
    expect(bloqueadoPorCalibracao("A_VENCER")).toBe(false);
    expect(bloqueadoPorCalibracao("EM_DIA")).toBe(false);
  });
});
