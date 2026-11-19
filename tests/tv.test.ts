import { describe, expect, it } from "vitest";
import { montarTv, nomePublico, type EntradaTv } from "@/lib/tv";
import type { TelemetriaDTO } from "@/lib/types";

const agora = new Date("2026-11-30T14:30:00-03:00");
const min = (m: number) => new Date(agora.getTime() + m * 60_000);
const leitura = (o: Partial<TelemetriaDTO> = {}): TelemetriaDTO => ({
  equipamentoId: "x", online: true, estado: "OCIOSO", lidoEm: agora.toISOString(), ultimoContatoEm: null, latenciaMs: null,
  programa: null, progresso: null, restanteMin: null, oee: null, metricas: [], alarmeAtivo: null, ...o,
});
const base = (o: Partial<EntradaTv> = {}): EntradaTv => ({
  agora,
  maquinas: [
    { id: "prusa", nome: "Prusa MK4", laboratorio: "IMP-01", status: "LIVRE", leitura: leitura({ estado: "OPERANDO", progresso: 0.42, restanteMin: 37 }) },
    { id: "laser", nome: "Laser CO2", laboratorio: "COR-01", status: "LIVRE", leitura: leitura() },
    { id: "cnc", nome: "CNC", laboratorio: "COR-01", status: "MANUTENCAO", leitura: leitura({ estado: "MANUTENCAO" }) },
  ],
  reservas: [
    { id: "r1", inicio: min(-30), fim: min(30), equipamentoId: "laser", usuarioNome: "Bruna Souza Lima" },
    { id: "r2", inicio: min(60), fim: min(120), equipamentoId: "laser", usuarioNome: "Rafael" },
    { id: "r0", inicio: min(-120), fim: min(-60), equipamentoId: "prusa", usuarioNome: "Ana" },
  ],
  aparelhos: [
    { ativo: true, online: true, bloqueado: false, emprestimo: { prazoEm: min(-5) } },
    { ativo: true, online: false, bloqueado: true, emprestimo: null },
    { ativo: true, online: true, bloqueado: false, emprestimo: { prazoEm: min(90) } },
  ],
  chamados: [
    { numero: 3, aparelho: "PC-SALA-07", status: "ABERTO", criadoEm: min(-2) },
    { numero: 2, aparelho: "CEL-JOAO", status: "EM_ATENDIMENTO", criadoEm: min(-10) },
  ],
  atividade: [
    { id: "a1", criadoEm: agora.toISOString(), acao: "auth.login", resumo: "Login de lider@labmaker.dev" },
    { id: "a2", criadoEm: agora.toISOString(), acao: "reserva.criada", resumo: "Reserva da Prusa por bruna@aluno.edu" },
  ],
  ...o,
});

describe("modo TV", () => {
  it("mostra o aluno só como primeiro nome + inicial", () => {
    expect(nomePublico("Bruna Souza Lima")).toBe("Bruna L.");
    expect(nomePublico("Rafael")).toBe("Rafael");
    expect(nomePublico("  ")).toBe("Aluno");
  });

  it("decide a situação de cada máquina", () => {
    const tv = montarTv(base());
    const s = Object.fromEntries(tv.maquinas.map((m) => [m.id, m.situacao]));
    expect(s).toEqual({ prusa: "OPERANDO", laser: "RESERVADA", cnc: "MANUTENCAO" });
    expect(tv.resumo).toMatchObject({ maquinas: 3, livres: 0, emUso: 2, manutencao: 1 });
  });

  it("mostra quem está usando agora e quem vem depois", () => {
    const laser = montarTv(base()).maquinas.find((m) => m.id === "laser")!;
    expect(laser.agora?.usuario).toBe("Bruna L.");
    expect(laser.proxima?.usuario).toBe("Rafael");
  });

  it("progresso só aparece com a máquina operando", () => {
    const tv = montarTv(base());
    expect(tv.maquinas.find((m) => m.id === "prusa")!.progresso).toBe(0.42);
    expect(tv.maquinas.find((m) => m.id === "laser")!.progresso).toBeNull();
  });

  it("alarme vence reserva", () => {
    const tv = montarTv(base({ maquinas: [{ id: "laser", nome: "Laser", laboratorio: "COR-01", status: "LIVRE", leitura: leitura({ alarmeAtivo: { codigo: "E1", mensagem: "Porta aberta", severidade: "CRITICO" } }) }] }));
    expect(tv.maquinas[0]).toMatchObject({ situacao: "ALARME", alarme: "Porta aberta" });
    expect(tv.resumo.alarmes).toBe(1);
  });

  it("próximas reservas ignoram as que já acabaram", () => {
    expect(montarTv(base()).proximas.map((p) => p.id)).toEqual(["r1", "r2"]);
  });

  it("conta aparelhos emprestados, atrasados e bloqueados", () => {
    expect(montarTv(base()).aparelhos).toEqual({ total: 3, online: 2, emprestados: 2, atrasados: 1, bloqueados: 1 });
  });

  it("fila de atendimento por ordem de chegada", () => {
    const a = montarTv(base()).atendimento;
    expect(a).toMatchObject({ esperando: 1, emAtendimento: 1 });
    expect(a.fila.map((f) => f.numero)).toEqual([2, 3]);
  });

  it("nunca mostra login nem e-mail na TV", () => {
    const at = montarTv(base()).atividade;
    expect(at.map((a) => a.id)).toEqual(["a2"]);
    expect(at[0].texto).not.toMatch(/@/);
  });

  it("espaço fechado às 21h", () => {
    expect(montarTv(base({ agora: new Date("2026-11-30T21:00:00-03:00") })).espaco.aberto).toBe(false);
    expect(montarTv(base()).espaco.aberto).toBe(true);
  });
});
