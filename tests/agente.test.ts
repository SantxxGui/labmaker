import { describe, expect, it } from "vitest";
import {
  APP_AGENTE, avaliarAcao, avaliarConformidade, avaliarRemocao, nomeRemovido, downloadPermitido, efeitoAcao, estaOnline, lerDispositivo, statusEfetivo, type ContextoAcao,
} from "@/lib/agente";
import { resumirLotes } from "@/lib/dispositivo-dto";
import type { AcaoDispositivoDTO } from "@/lib/types";

const agora = new Date("2026-11-17T15:00:00Z");
const min = (m: number) => new Date(agora.getTime() - m * 60_000);

const base: ContextoAcao = {
  tipo: "BLOQUEAR", hostname: "CT-MET-NB-014", so: "WINDOWS", online: true, bloqueado: false,
  appsInstalados: [APP_AGENTE, "Microsoft Teams"], appsBloqueadosPolitica: ["Steam"],
};

describe("telemetria do agente", () => {
  const d = { id: "dv_x", tipo: "NOTEBOOK" as const, so: "WINDOWS" as const, bloqueado: false, appsInstalados: [APP_AGENTE, "Fusion 360"], responsavelNome: "Ana" };

  it("é determinística e dentro das faixas", () => {
    const a = lerDispositivo({ ...d, ultimoContatoEm: min(1) }, agora);
    const b = lerDispositivo({ ...d, ultimoContatoEm: min(1) }, agora);
    expect(a).toEqual(b);
    expect(a.online).toBe(true);
    for (const v of [a.cpu!, a.memoria!, a.disco!, a.bateria!]) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(100);
    expect(a.appAtivo).toBe("Fusion 360");
  });

  it("dispositivo sem contato recente fica offline e sem métricas ao vivo", () => {
    const l = lerDispositivo({ ...d, ultimoContatoEm: min(3 * 24 * 60) }, agora);
    expect(l.online).toBe(false);
    expect(l.cpu).toBeNull();
    expect(estaOnline(null, agora)).toBe(false);
  });

  it("dispositivo bloqueado não mostra sessão nem app", () => {
    const l = lerDispositivo({ ...d, bloqueado: true, ultimoContatoEm: min(1) }, agora);
    expect(l.usuarioSessao).toBeNull();
    expect(l.appAtivo).toBeNull();
  });
});

describe("conformidade", () => {
  const ok = {
    so: "WINDOWS" as const, criptografado: true, antivirusAtivo: true, firewallAtivo: true, atualizacoesPendentes: 0, agenteVersao: "4.6",
    ultimoContatoEm: min(2), politica: { nome: "Laboratório", exigirCriptografia: true },
  };
  it("tudo certo = 100%", () => {
    expect(avaliarConformidade(ok, agora)).toMatchObject({ conforme: true, pontuacao: 100 });
  });
  it("reprova antivírus desligado, agente antigo e muitas atualizações", () => {
    const c = avaliarConformidade({ ...ok, antivirusAtivo: false, agenteVersao: "4.3", atualizacoesPendentes: 7 }, agora);
    expect(c.conforme).toBe(false);
    expect(c.itens.filter((i) => !i.ok).map((i) => i.chave).sort()).toEqual(["agente", "antivirus", "atualizacoes"]);
  });
  it("criptografia só reprova quando a política exige", () => {
    expect(avaliarConformidade({ ...ok, criptografado: false }, agora).conforme).toBe(false);
    expect(avaliarConformidade({ ...ok, criptografado: false, politica: { nome: "X", exigirCriptografia: false } }, agora).conforme).toBe(true);
  });
});

describe("regras das ações remotas", () => {
  it("offline: ação vai para a fila, mas suporte remoto é recusado", () => {
    expect(avaliarAcao({ ...base, online: false })).toEqual({ ok: true, enfileirada: true });
    expect(avaliarAcao({ ...base, tipo: "SESSAO_REMOTA", online: false, justificativa: "Chamado #1" }).ok).toBe(false);
  });
  it("não bloqueia duas vezes nem desbloqueia o que não está bloqueado", () => {
    expect(avaliarAcao({ ...base, bloqueado: true }).ok).toBe(false);
    expect(avaliarAcao({ ...base, tipo: "DESBLOQUEAR" }).ok).toBe(false);
  });
  it("instalação respeita catálogo, política e sistema", () => {
    expect(avaliarAcao({ ...base, tipo: "INSTALAR_APP", parametro: "Python 3.13" })).toEqual({ ok: true, enfileirada: false });
    expect(avaliarAcao({ ...base, tipo: "INSTALAR_APP", parametro: "Steam" }).ok).toBe(false);
    expect(avaliarAcao({ ...base, tipo: "INSTALAR_APP", parametro: "Microsoft Teams" }).ok).toBe(false);
    expect(avaliarAcao({ ...base, so: "ANDROID", tipo: "INSTALAR_APP", parametro: "Fusion 360" }).ok).toBe(false);
  });
  it("o agente não pode ser removido", () => {
    expect(avaliarAcao({ ...base, tipo: "REMOVER_APP", parametro: APP_AGENTE }).ok).toBe(false);
  });
  it("apagar dados exige justificativa e o nome exato do dispositivo", () => {
    const j = "Notebook roubado — boletim registrado";
    expect(avaliarAcao({ ...base, tipo: "APAGAR_DADOS", justificativa: j, confirmacao: "ct-met-nb-014" }).ok).toBe(false);
    expect(avaliarAcao({ ...base, tipo: "APAGAR_DADOS", justificativa: "curta", confirmacao: "CT-MET-NB-014" }).ok).toBe(false);
    expect(avaliarAcao({ ...base, tipo: "APAGAR_DADOS", justificativa: j, confirmacao: "CT-MET-NB-014" }).ok).toBe(true);
  });
  it("efeitos: bloquear, instalar, remover e apagar", () => {
    const d = { bloqueado: false, appsInstalados: [APP_AGENTE, "7-Zip"] };
    expect(efeitoAcao("BLOQUEAR", d)).toEqual({ bloqueado: true });
    expect(efeitoAcao("INSTALAR_APP", d, "Python 3.13").appsInstalados).toContain("Python 3.13");
    expect(efeitoAcao("REMOVER_APP", d, "7-Zip").appsInstalados).toEqual([APP_AGENTE]);
    expect(efeitoAcao("APAGAR_DADOS", d)).toEqual({ bloqueado: true, appsInstalados: [APP_AGENTE] });
  });
});

describe("fila de entrega", () => {
  const acao = (id: string, msAtras: number) => ({ id, tipo: "BLOQUEAR" as const, status: "PENDENTE" as const, criadoEm: new Date(agora.getTime() - msAtras) });
  it("progride PENDENTE → ENTREGUE → EXECUTADA quando online", () => {
    expect(statusEfetivo(acao("a1", 100), true, agora).status).toBe("PENDENTE");
    expect(statusEfetivo(acao("a1", 60_000), true, agora).status).toBe("EXECUTADA");
  });
  it("offline fica na fila", () => {
    expect(statusEfetivo(acao("a1", 86_400_000), false, agora).status).toBe("PENDENTE");
  });
  it("status final gravado não muda", () => {
    expect(statusEfetivo({ ...acao("a1", 10), status: "RECUSADA" }, true, agora).status).toBe("RECUSADA");
  });
});

describe("downloads e lotes", () => {
  it("bloqueia executáveis conforme o modo", () => {
    expect(downloadPermitido("relatorio.pdf", "BLOQUEAR_EXECUTAVEIS").ok).toBe(true);
    expect(downloadPermitido("Setup.EXE", "BLOQUEAR_EXECUTAVEIS").ok).toBe(false);
    expect(downloadPermitido("Setup.exe", "LIVRE").ok).toBe(true);
  });
  it("resume confirmações de leitura por lote", () => {
    const a = (status: AcaoDispositivoDTO["status"]) => ({
      id: Math.random().toString(), tipo: "ALERTA", status, lote: "lt1", titulo: "T", mensagem: "M", prioridade: "AVISO", parametro: null,
      justificativa: null, motivo: null, criadoEm: agora.toISOString(), concluidoEm: null, usuario: { id: "u", nome: "Ana" },
      dispositivo: { id: "d", hostname: "h", tipo: "NOTEBOOK" },
    }) as AcaoDispositivoDTO;
    const [l] = resumirLotes([a("EXECUTADA"), a("EXECUTADA"), a("ENTREGUE"), a("PENDENTE")]);
    expect(l).toMatchObject({ total: 4, lidos: 2, entregues: 1, pendentes: 1 });
  });
});

describe("remover aparelho", () => {
  it("exige o nome digitado e nada de empréstimo aberto", () => {
    expect(avaliarRemocao({ hostname: "CEL-ANA", confirmacao: "cel-ana ", emprestimoAberto: false })).toEqual({ ok: true });
    expect(avaliarRemocao({ hostname: "CEL-ANA", confirmacao: "CEL-AN", emprestimoAberto: false }).ok).toBe(false);
    expect(avaliarRemocao({ hostname: "CEL-ANA", confirmacao: "CEL-ANA", emprestimoAberto: true })).toMatchObject({ ok: false, motivo: expect.stringContaining("devolução") });
  });
  it("libera o nome com a data da remoção no horário de Brasília", () => {
    expect(nomeRemovido("CEL-ANA", new Date("2026-11-19T12:30:00Z"))).toBe("CEL-ANA (removido 19/11 09:30)");
  });
});
