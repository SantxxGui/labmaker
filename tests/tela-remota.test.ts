import { describe, expect, it } from "vitest";
import { DURACAO_MAX_MS, FILA_CONTROLE_MAX, VALIDADE_PEDIDO_MS, avaliarPedidoControle, avaliarQuadro, empilharEventos, estadoSessao, type EventoControle, type SessaoTela } from "@/lib/tela-remota";

const agora = new Date("2026-11-30T14:00:00Z");
const min = (n: number) => new Date(agora.getTime() + n * 60_000);
const acao = (o: Partial<{ status: string; tipo: string; criadoEm: Date; dispositivoId: string }> = {}) =>
  ({ id: "a1", dispositivoId: "d1", tipo: "SESSAO_REMOTA", status: "EXECUTADA", criadoEm: min(-1), ...o }) as Parameters<typeof avaliarQuadro>[0];
const sessao = (o: Partial<SessaoTela> = {}): SessaoTela => ({ acaoId: "a1", dispositivoId: "d1", inicio: min(-1), ultimoQuadroEm: min(0), encerradaEm: null, motivoFim: null, quadro: null, versao: 0,
  controle: "nenhum", controlePor: null, controleDesde: null, fila: [], eventosEntregues: 0, ...o });

describe("Tela remota — quem pode transmitir", () => {
  it("primeiro quadro depois que o usuário autorizou abre uma sessão nova", () => {
    expect(avaliarQuadro(acao(), "d1", undefined, agora)).toEqual({ ok: true, nova: true });
    expect(avaliarQuadro(acao({ status: "ENTREGUE" }), "d1", undefined, agora).ok).toBe(true);
  });
  it("sem pedido, pedido de outro aparelho ou de outro tipo → recusado", () => {
    expect(avaliarQuadro(null, "d1", undefined, agora).ok).toBe(false);
    expect(avaliarQuadro(acao({ dispositivoId: "d2" }), "d1", undefined, agora).ok).toBe(false);
    expect(avaliarQuadro(acao({ tipo: "ALERTA" }), "d1", undefined, agora).ok).toBe(false);
  });
  it("pedido recusado pelo usuário ou ainda não entregue → recusado", () => {
    expect(avaliarQuadro(acao({ status: "RECUSADA" }), "d1", undefined, agora)).toMatchObject({ ok: false, motivo: expect.stringMatching(/não foi autorizado/) });
    expect(avaliarQuadro(acao({ status: "PENDENTE" }), "d1", undefined, agora).ok).toBe(false);
  });
  it("pedido velho demais não abre sessão", () => {
    expect(avaliarQuadro(acao({ criadoEm: new Date(agora.getTime() - VALIDADE_PEDIDO_MS - 1) }), "d1", undefined, agora).ok).toBe(false);
  });
  it("sessão encerrada pelo Líder ou pelo usuário não aceita mais quadros", () => {
    expect(avaliarQuadro(acao(), "d1", sessao({ encerradaEm: min(0), motivoFim: "Encerrada pelo Líder." }), agora)).toEqual({ ok: false, motivo: "Encerrada pelo Líder." });
  });
  it(`sessão termina sozinha após ${DURACAO_MAX_MS / 60_000} minutos`, () => {
    expect(avaliarQuadro(acao(), "d1", sessao({ inicio: min(-31) }), agora).ok).toBe(false);
    expect(avaliarQuadro(acao(), "d1", sessao({ inicio: min(-29) }), agora)).toEqual({ ok: true, nova: false });
  });
});

describe("Tela remota — o que o Líder vê", () => {
  it("ao vivo, sem sinal e encerrada", () => {
    expect(estadoSessao(undefined, agora).ativa).toBe(false);
    expect(estadoSessao(sessao(), agora)).toMatchObject({ ativa: true, sinal: "ao-vivo" });
    expect(estadoSessao(sessao({ ultimoQuadroEm: min(-1) }), agora)).toMatchObject({ ativa: true, sinal: "sem-sinal" });
    expect(estadoSessao(sessao({ inicio: min(-31) }), agora)).toMatchObject({ ativa: false, sinal: "encerrada", motivoFim: expect.stringMatching(/30 min/) });
  });
});

describe("Controle remoto (mouse e teclado)", () => {
  it("só pode ser pedido com a tela ao vivo, e uma vez por vez", () => {
    expect(avaliarPedidoControle(undefined, agora)).toMatchObject({ ok: false, motivo: expect.stringMatching(/tela ao vivo/) });
    expect(avaliarPedidoControle(sessao({ encerradaEm: min(0) }), agora).ok).toBe(false);
    expect(avaliarPedidoControle(sessao(), agora)).toEqual({ ok: true });
    expect(avaliarPedidoControle(sessao({ controle: "pedido" }), agora)).toMatchObject({ ok: false, motivo: expect.stringMatching(/aguardando/) });
    expect(avaliarPedidoControle(sessao({ controle: "ativo" }), agora)).toMatchObject({ ok: false, motivo: expect.stringMatching(/já está controlando/) });
    expect(avaliarPedidoControle(sessao({ controle: "recusado" }), agora)).toEqual({ ok: true }); // pode pedir de novo
  });
  it("a sessão mostra o estado do controle só enquanto está ativa", () => {
    expect(estadoSessao(sessao({ controle: "ativo", controlePor: "Ana" }), agora)).toMatchObject({ controle: "ativo", controlePor: "Ana" });
    expect(estadoSessao(sessao({ controle: "ativo", encerradaEm: min(0) }), agora)).toMatchObject({ controle: "nenhum" });
  });
  it("movimentos seguidos viram um só; cliques e teclas ficam na ordem", () => {
    const m = (x: number): EventoControle => ({ t: "m", x, y: 0.5 });
    const f = empilharEventos([], [m(0.1), m(0.2), { t: "b", b: 0, d: true, x: 0.2, y: 0.5 }, { t: "b", b: 0, d: false, x: 0.2, y: 0.5 }, m(0.3), m(0.4), { t: "k", c: "KeyA", d: true }]);
    expect(f.map((e) => e.t)).toEqual(["m", "b", "b", "m", "k"]);
    expect(f[0]).toEqual(m(0.2));
    expect(f[3]).toEqual(m(0.4));
  });
  it("fila cheia: saem primeiro os movimentos mais antigos, nunca as teclas", () => {
    const teclas: EventoControle[] = Array.from({ length: FILA_CONTROLE_MAX }, (_, i) => ({ t: "k", c: "KeyA", d: i % 2 === 0 }));
    const f = empilharEventos([{ t: "m", x: 0, y: 0 }, ...teclas.slice(0, -1)], [{ t: "k", c: "KeyB", d: true }]);
    expect(f).toHaveLength(FILA_CONTROLE_MAX);
    expect(f.some((e) => e.t === "m")).toBe(false);
    expect(f.at(-1)).toEqual({ t: "k", c: "KeyB", d: true });
  });
});
