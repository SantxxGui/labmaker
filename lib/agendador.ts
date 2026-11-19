import { AgenteModel } from "@/models/agente.model";
import { AuditoriaModel } from "@/models/auditoria.model";
import { automacoesDoCheckin } from "@/lib/automacao";
import { notificarAparelho } from "@/lib/push";

/**
 * Agendador do servidor (a cada minuto).
 *
 * O check-in do aparelho já é o "relógio" das automações — mas um celular com o app fechado
 * não faz check-in. Para ele, o servidor gera o lembrete de devolução e o aviso de atraso
 * e manda por Web Push. O índice único "acoes_automaticas_unicas" impede duplicar com o check-in.
 * Fechamento/abertura continuam só no check-in: travar exige o aparelho ligado.
 */
export async function varrerAutomacoes(agora = new Date()) {
  let criadas = 0;
  for (const d of await AgenteModel.alvosDoAgendador()) {
    const ctx = await AgenteModel.contextoAutomacao(d.id);
    const acoes = automacoesDoCheckin({ agora, dispositivo: d, politica: null, ...ctx }).filter((a) => a.tipo === "ALERTA");
    for (const { resumo, ...a } of acoes) {
      const acao = await AgenteModel.criarAcaoSistema(d.id, a);
      if (!acao) continue;
      criadas++;
      await AuditoriaModel.registrar({ autor: null, acao: "dispositivo.automacao", entidade: "dispositivo", entidadeId: d.id, ip: null, resumo: `${resumo} (agendador)` });
      await notificarAparelho(d.id, { titulo: a.titulo ?? "LabMaker", corpo: a.mensagem ?? "", tag: acao.id });
    }
  }
  return criadas;
}

const g = globalThis as unknown as { agendadorLabmaker?: ReturnType<typeof setInterval> };

/** Liga o agendador uma única vez por processo (chamado pelo instrumentation.ts). */
export function iniciarAgendador(intervaloMs = 60_000) {
  if (g.agendadorLabmaker || process.env.AGENDADOR === "off") return;
  g.agendadorLabmaker = setInterval(() => {
    varrerAutomacoes().catch((e) => console.error("[agendador]", e instanceof Error ? e.message : e));
  }, intervaloMs);
  g.agendadorLabmaker.unref?.();
}
