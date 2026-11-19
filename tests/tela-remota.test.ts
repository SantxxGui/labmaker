import { describe, expect, it } from "vitest";
import { DURACAO_MAX_MS, VALIDADE_PEDIDO_MS, avaliarQuadro, estadoSessao, type SessaoTela } from "@/lib/tela-remota";

const agora = new Date("2026-11-30T14:00:00Z");
const min = (n: number) => new Date(agora.getTime() + n * 60_000);
const acao = (o: Partial<{ status: string; tipo: string; criadoEm: Date; dispositivoId: string }> = {}) =>
  ({ id: "a1", dispositivoId: "d1", tipo: "SESSAO_REMOTA", status: "EXECUTADA", criadoEm: min(-1), ...o }) as Parameters<typeof avaliarQuadro>[0];
const sessao = (o: Partial<SessaoTela> = {}): SessaoTela => ({ acaoId: "a1", dispositivoId: "d1", inicio: min(-1), ultimoQuadroEm: min(0), encerradaEm: null, motivoFim: null, quadro: null, versao: 0, ...o });

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
    expect(avaliarQuadro(acao(), "d1", sessao({ inicio: min(-11) }), agora).ok).toBe(false);
    expect(avaliarQuadro(acao(), "d1", sessao({ inicio: min(-9) }), agora)).toEqual({ ok: true, nova: false });
  });
});

describe("Tela remota — o que o Líder vê", () => {
  it("ao vivo, sem sinal e encerrada", () => {
    expect(estadoSessao(undefined, agora).ativa).toBe(false);
    expect(estadoSessao(sessao(), agora)).toMatchObject({ ativa: true, sinal: "ao-vivo" });
    expect(estadoSessao(sessao({ ultimoQuadroEm: min(-1) }), agora)).toMatchObject({ ativa: true, sinal: "sem-sinal" });
    expect(estadoSessao(sessao({ inicio: min(-11) }), agora)).toMatchObject({ ativa: false, sinal: "encerrada", motivoFim: expect.stringMatching(/10 min/) });
  });
});
