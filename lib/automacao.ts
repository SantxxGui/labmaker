/**
 * Automações do espaço — regras puras (testadas em tests/automacao.test.ts).
 * Rodam no check-in de cada aparelho (sem servidor de agendamento: o próprio check-in é o relógio).
 *
 *  1. Lembrete de devolução: 15 min antes do prazo, aviso no notebook emprestado.
 *  2. Atraso: quando o prazo passa, aviso crítico no aparelho (uma vez).
 *  3. Fechamento: com a política "bloquear fora do horário", aparelhos do espaço (não emprestados)
 *     travam sozinhos depois das 20h e aos domingos — e destravam na abertura seguinte.
 *
 * Cada ação automática tem um `parametro` único (auto:…) — é assim que nunca se repete.
 */
import { LAB, diaDaSemana } from "@/lib/slots";
import type { SeveridadeAlarme, TipoDispositivo } from "@/lib/types";

export const LEMBRETE_ANTES_MIN = 15;

export type AcaoAutomatica = {
  tipo: "ALERTA" | "BLOQUEAR" | "DESBLOQUEAR";
  parametro: string;
  titulo?: string;
  mensagem?: string;
  prioridade?: SeveridadeAlarme;
  resumo: string; // para a auditoria
};

/** Data (AAAA-MM-DD) e minutos do dia no fuso do espaço (-03:00). */
export function relogioDoEspaco(agora = new Date()) {
  const local = new Date(agora.getTime() - 3 * 3_600_000);
  const data = local.toISOString().slice(0, 10);
  return { data, minutos: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

export function espacoAberto(agora = new Date()) {
  const { data, minutos } = relogioDoEspaco(agora);
  return !LAB.diasFechados.includes(diaDaSemana(data)) && minutos >= LAB.abertura * 60 && minutos < LAB.fechamento * 60;
}

const hora = (d: Date) => {
  const l = new Date(d.getTime() - 3 * 3_600_000);
  return `${String(l.getUTCHours()).padStart(2, "0")}:${String(l.getUTCMinutes()).padStart(2, "0")}`;
};

export function automacoesDoCheckin(c: {
  agora: Date;
  dispositivo: { hostname: string; tipo: TipoDispositivo; bloqueado: boolean };
  politica: { bloquearForaHorario: boolean } | null;
  emprestimo: { id: string; prazoEm: Date } | null;
  /** parâmetros de ações automáticas já criadas para este aparelho */
  jaFeitas: Set<string>;
  /** parâmetro do último BLOQUEAR/DESBLOQUEAR deste aparelho (para saber se o bloqueio atual foi automático) */
  ultimoBloqueio: string | null;
}): AcaoAutomatica[] {
  const r: AcaoAutomatica[] = [];
  const nova = (a: AcaoAutomatica) => { if (!c.jaFeitas.has(a.parametro)) r.push(a); };
  const { data } = relogioDoEspaco(c.agora);

  // 1 e 2 — empréstimo
  if (c.emprestimo) {
    const faltaMin = (c.emprestimo.prazoEm.getTime() - c.agora.getTime()) / 60_000;
    if (faltaMin > 0 && faltaMin <= LEMBRETE_ANTES_MIN) {
      nova({
        tipo: "ALERTA", parametro: `auto:lembrete:${c.emprestimo.id}`, prioridade: "AVISO",
        titulo: `Devolução em ${Math.max(1, Math.round(faltaMin))} min`,
        mensagem: `Salve seus arquivos e devolva o ${c.dispositivo.hostname} no balcão até ${hora(c.emprestimo.prazoEm)}.`,
        resumo: `Lembrete automático de devolução enviado para ${c.dispositivo.hostname}`,
      });
    } else if (faltaMin <= 0) {
      nova({
        tipo: "ALERTA", parametro: `auto:atraso:${c.emprestimo.id}`, prioridade: "CRITICO",
        titulo: "Empréstimo atrasado",
        mensagem: `O prazo do ${c.dispositivo.hostname} terminou às ${hora(c.emprestimo.prazoEm)}. Devolva no balcão o quanto antes.`,
        resumo: `Aviso automático de atraso enviado para ${c.dispositivo.hostname}`,
      });
    }
  }

  // 3 — fechamento / abertura (celulares pessoais e aparelhos emprestados ficam de fora)
  if (c.politica?.bloquearForaHorario && !c.emprestimo && c.dispositivo.tipo !== "SMARTPHONE") {
    const aberto = espacoAberto(c.agora);
    if (!aberto && !c.dispositivo.bloqueado) {
      nova({ tipo: "BLOQUEAR", parametro: `auto:fechamento:${data}`, resumo: `Bloqueio automático de ${c.dispositivo.hostname} no fechamento do espaço` });
    }
    // destrava só o que a automação travou ANTES de hoje (um teste de bloqueio durante o dia não é desfeito)
    const auto = c.ultimoBloqueio?.match(/^auto:fechamento:(\d{4}-\d{2}-\d{2})$/);
    if (aberto && c.dispositivo.bloqueado && auto && auto[1] < data) {
      nova({ tipo: "DESBLOQUEAR", parametro: `auto:abertura:${data}`, resumo: `Desbloqueio automático de ${c.dispositivo.hostname} na abertura do espaço` });
    }
  }
  return r;
}
