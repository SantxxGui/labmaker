import { describe, expect, it } from "vitest";
import { JANELA_AJUDA_VIVA_MS, janelaAjudaAberta, parametroTelaDoChamado, transicaoChamado } from "@/lib/chamados";

describe("Chamados", () => {
  it("aberto → em atendimento → resolvido", () => {
    expect(transicaoChamado("ABERTO", "atender")).toEqual({ ok: true, status: "EM_ATENDIMENTO" });
    expect(transicaoChamado("EM_ATENDIMENTO", "resolver")).toEqual({ ok: true, status: "RESOLVIDO" });
    expect(transicaoChamado("ABERTO", "resolver")).toEqual({ ok: true, status: "RESOLVIDO" });
  });
  it("não atende duas vezes nem mexe em chamado encerrado", () => {
    expect(transicaoChamado("EM_ATENDIMENTO", "atender").ok).toBe(false);
    expect(transicaoChamado("RESOLVIDO", "atender").ok).toBe(false);
    expect(transicaoChamado("CANCELADO", "resolver").ok).toBe(false);
  });
  it("tela pré-autorizada só quando o usuário marcou ao pedir ajuda", () => {
    expect(parametroTelaDoChamado("c1", true)).toBe("chamado:c1:pre-autorizado");
    expect(parametroTelaDoChamado("c1", false)).toBe("chamado:c1");
  });
});

describe("janelinha de ajuda aberta", () => {
  it("conta como aberta enquanto dá sinal (a cada 2 s) e fechada depois de 8 s sem sinal", () => {
    const agora = 1_000_000;
    expect(janelaAjudaAberta(undefined, agora)).toBe(false);
    expect(janelaAjudaAberta(agora - 2_000, agora)).toBe(true);
    expect(janelaAjudaAberta(agora - JANELA_AJUDA_VIVA_MS, agora)).toBe(false);
  });
});
