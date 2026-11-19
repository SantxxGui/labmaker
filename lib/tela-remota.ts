/**
 * Tela remota (suporte remoto) — regras puras + armazenamento do último quadro.
 *
 * Fluxo: o Líder pede "Suporte remoto" (ação SESSAO_REMOTA, com motivo) → o agente mostra um diálogo
 * no computador → o USUÁRIO autoriza → o agente envia um quadro (JPEG) por segundo para
 * POST /api/agente/tela → o Líder vê ao vivo em GET /api/dispositivos/:id/tela/imagem.
 * A sessão termina quando o Líder encerra, o usuário encerra, ou após DURACAO_MAX_MS.
 *
 * Só VISUALIZAÇÃO, de propósito (LGPD + segurança): nada de mouse/teclado remotos.
 * Os quadros ficam em memória do servidor (o último de cada aparelho) e nunca vão para o banco.
 */
import { EventEmitter } from "node:events";
import type { StatusAcao, TipoAcaoDispositivo } from "@/lib/types";

export const DURACAO_MAX_MS = 10 * 60_000; // uma sessão dura no máximo 10 min
export const VALIDADE_PEDIDO_MS = 30 * 60_000; // o usuário tem 30 min para aceitar o pedido
export const SEM_QUADRO_MS = 10_000; // 10 s sem quadro novo = conexão caiu
export const TAMANHO_MAX_BYTES = 3 * 1024 * 1024;
export const INTERVALO_QUADRO_MS = 1000;

export type SessaoTela = {
  acaoId: string;
  dispositivoId: string;
  inicio: Date;
  ultimoQuadroEm: Date | null;
  encerradaEm: Date | null;
  motivoFim: string | null;
  quadro: { dados: Buffer; tipo: "image/jpeg" | "image/png" } | null;
  /** sobe a cada imagem nova (o navegador do Líder só baixa quando muda) */
  versao: number;
};

type AcaoParaTela = { id: string; dispositivoId: string; tipo: TipoAcaoDispositivo; status: StatusAcao; criadoEm: Date };

/** O agente pode enviar este quadro? (pura — testada em tests/tela-remota.test.ts) */
export function avaliarQuadro(
  acao: AcaoParaTela | null,
  dispositivoId: string,
  sessao: SessaoTela | undefined,
  agora = new Date(),
): { ok: true; nova: boolean } | { ok: false; motivo: string } {
  if (!acao || acao.dispositivoId !== dispositivoId || acao.tipo !== "SESSAO_REMOTA") return { ok: false, motivo: "Não há pedido de suporte remoto para este aparelho." };
  if (acao.status !== "ENTREGUE" && acao.status !== "EXECUTADA") return { ok: false, motivo: "O pedido não foi autorizado." };
  if (sessao && sessao.acaoId === acao.id) {
    if (sessao.encerradaEm) return { ok: false, motivo: sessao.motivoFim ?? "Sessão encerrada." };
    if (agora.getTime() - sessao.inicio.getTime() > DURACAO_MAX_MS) return { ok: false, motivo: "Tempo máximo da sessão (10 min) atingido." };
    return { ok: true, nova: false };
  }
  if (agora.getTime() - acao.criadoEm.getTime() > VALIDADE_PEDIDO_MS) return { ok: false, motivo: "O pedido de suporte remoto expirou." };
  return { ok: true, nova: true };
}

/** Situação da sessão para a tela do Líder. */
export function estadoSessao(s: SessaoTela | undefined, agora = new Date()) {
  if (!s) return { ativa: false as const };
  const expira = new Date(s.inicio.getTime() + DURACAO_MAX_MS);
  const expirada = agora > expira;
  const caiu = !!s.ultimoQuadroEm && agora.getTime() - s.ultimoQuadroEm.getTime() > SEM_QUADRO_MS;
  const ativa = !s.encerradaEm && !expirada;
  return {
    ativa,
    acaoId: s.acaoId,
    inicio: s.inicio.toISOString(),
    expiraEm: expira.toISOString(),
    ultimoQuadroEm: s.ultimoQuadroEm?.toISOString() ?? null,
    versao: s.versao,
    sinal: ativa ? (caiu ? ("sem-sinal" as const) : ("ao-vivo" as const)) : ("encerrada" as const),
    encerradaEm: s.encerradaEm?.toISOString() ?? (expirada ? expira.toISOString() : null),
    motivoFim: s.motivoFim ?? (expirada ? "Tempo máximo da sessão (10 min) atingido." : null),
  };
}

// ───────────────────────── armazenamento em memória ─────────────────────────
// globalThis sobrevive ao recarregamento de módulos do `next dev`.
const g = globalThis as unknown as { __labmakerTelas?: Map<string, SessaoTela>; __labmakerTelaEventos?: EventEmitter };
const telas = (g.__labmakerTelas ??= new Map<string, SessaoTela>());
/** Avisa quem está assistindo (SSE) que chegou imagem nova ou que a sessão acabou. Evento = id do aparelho. */
export const telaEventos = (g.__labmakerTelaEventos ??= new EventEmitter().setMaxListeners(100));

export const TelaStore = {
  buscar: (dispositivoId: string) => telas.get(dispositivoId),
  iniciar(acaoId: string, dispositivoId: string, agora = new Date()) {
    const s: SessaoTela = { acaoId, dispositivoId, inicio: agora, ultimoQuadroEm: null, encerradaEm: null, motivoFim: null, quadro: null, versao: 0 };
    telas.set(dispositivoId, s);
    telaEventos.emit(dispositivoId, { tipo: "inicio" });
    return s;
  },
  gravarQuadro(dispositivoId: string, dados: Buffer, tipo: "image/jpeg" | "image/png", agora = new Date()) {
    const s = telas.get(dispositivoId);
    if (!s) return;
    Object.assign(s, { quadro: { dados, tipo }, ultimoQuadroEm: agora, versao: s.versao + 1 });
    telaEventos.emit(dispositivoId, { tipo: "quadro", versao: s.versao });
  },
  /** A tela não mudou: o agente só avisa que continua lá (economiza banda — nada de reenviar a mesma imagem). */
  manterVivo(dispositivoId: string, agora = new Date()) {
    const s = telas.get(dispositivoId);
    if (s) s.ultimoQuadroEm = agora;
  },
  encerrar(dispositivoId: string, motivo: string, agora = new Date()) {
    const s = telas.get(dispositivoId);
    if (!s || s.encerradaEm) return null;
    Object.assign(s, { encerradaEm: agora, motivoFim: motivo, quadro: null }); // o último quadro é descartado
    telaEventos.emit(dispositivoId, { tipo: "fim", motivo });
    return s;
  },
};
