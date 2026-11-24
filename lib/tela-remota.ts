/**
 * Tela remota (suporte remoto) — regras puras + armazenamento do último quadro.
 *
 * Fluxo: o Líder pede "Suporte remoto" (ação SESSAO_REMOTA, com motivo) → o agente mostra um diálogo
 * no computador → o USUÁRIO autoriza → o agente envia um quadro (JPEG) por segundo para
 * POST /api/agente/tela → o Líder vê ao vivo em GET /api/dispositivos/:id/tela/imagem.
 * A sessão termina quando o Líder encerra, o usuário encerra, ou após DURACAO_MAX_MS.
 *
 * CONTROLE REMOTO (mouse e teclado, tipo AnyDesk) é um segundo consentimento, à parte: com a tela
 * já ao vivo, o Líder pede o controle → o usuário vê "Permitir que o Líder controle seu mouse e
 * teclado?" → se aceitar, os eventos do Líder entram numa fila em memória e o agente os busca na
 * hora (POST /api/agente/tela/controle, espera longa) e os aplica no computador. Enquanto isso, uma
 * janela fixa avisa "o Líder está CONTROLANDO" com o botão Parar, e a tela vai a ~4 quadros/s.
 * Teclas digitadas nunca são gravadas (nem na auditoria): só quem pediu, quando e quantos eventos.
 *
 * Os quadros ficam em memória do servidor (o último de cada aparelho) e nunca vão para o banco.
 */
import { EventEmitter } from "node:events";
import type { StatusAcao, TipoAcaoDispositivo } from "@/lib/types";

export const DURACAO_MAX_MS = 30 * 60_000; // uma sessão dura no máximo 30 min (tempo de resolver um problema)
export const VALIDADE_PEDIDO_MS = 30 * 60_000; // o usuário tem 30 min para aceitar o pedido
export const SEM_QUADRO_MS = 10_000; // 10 s sem quadro novo = conexão caiu
export const TAMANHO_MAX_BYTES = 3 * 1024 * 1024;
export const INTERVALO_QUADRO_MS = 1000;
/** Com o controle ativo a tela atualiza ~4×/s: dá para ver o cursor e o que se clica. */
export const INTERVALO_QUADRO_CONTROLE_MS = 250;
/** O agente espera até isto por eventos novos numa chamada (espera longa: chega na hora em que existe). */
export const ESPERA_CONTROLE_MS = 20_000;
/** Fila de eventos por aparelho: movimentos seguidos se fundem; acima disto os movimentos mais antigos saem. */
export const FILA_CONTROLE_MAX = 400;

export type EstadoControle = "nenhum" | "pedido" | "ativo" | "recusado" | "indisponivel";

/**
 * Um evento do Líder, em coordenadas de 0 a 1 sobre a imagem (o agente converte para a tela real).
 * m = mover · b = botão (0 esquerdo, 1 meio, 2 direito; d = apertou) · w = roda (dy em "degraus":
 * + para baixo) · k = tecla física (KeyboardEvent.code; d = apertou) · txt = colar um texto.
 */
export type EventoControle =
  | { t: "m"; x: number; y: number }
  | { t: "b"; b: 0 | 1 | 2; d: boolean; x: number; y: number }
  | { t: "w"; dy: number; x: number; y: number }
  | { t: "k"; c: string; d: boolean }
  | { t: "txt"; s: string };

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
  controle: EstadoControle;
  /** nome de quem pediu o controle (aparece no aviso do computador) */
  controlePor: string | null;
  controleDesde: Date | null;
  fila: EventoControle[];
  eventosEntregues: number;
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
    if (agora.getTime() - sessao.inicio.getTime() > DURACAO_MAX_MS) return { ok: false, motivo: `Tempo máximo da sessão (${DURACAO_MAX_MS / 60_000} min) atingido.` };
    return { ok: true, nova: false };
  }
  if (agora.getTime() - acao.criadoEm.getTime() > VALIDADE_PEDIDO_MS) return { ok: false, motivo: "O pedido de suporte remoto expirou." };
  return { ok: true, nova: true };
}

/** O Líder pode pedir o controle agora? (pura) */
export function avaliarPedidoControle(s: SessaoTela | undefined, agora = new Date()): { ok: true } | { ok: false; motivo: string } {
  if (!s || !estadoSessao(s, agora).ativa) return { ok: false, motivo: "Abra a tela ao vivo primeiro: o controle é pedido com a tela já compartilhada." };
  if (s.controle === "ativo") return { ok: false, motivo: "Você já está controlando este computador." };
  if (s.controle === "pedido") return { ok: false, motivo: "Já pedido: aguardando o usuário permitir no computador." };
  return { ok: true };
}

/**
 * Junta eventos novos na fila (pura): movimentos seguidos viram um só (só importa onde o mouse
 * terminou) e, se a fila estourar, saem primeiro os movimentos mais antigos.
 */
export function empilharEventos(fila: EventoControle[], novos: EventoControle[], max = FILA_CONTROLE_MAX): EventoControle[] {
  const r = [...fila];
  for (const e of novos) {
    if (e.t === "m" && r.at(-1)?.t === "m") r[r.length - 1] = e;
    else r.push(e);
  }
  while (r.length > max) {
    const i = r.findIndex((e) => e.t === "m");
    r.splice(i >= 0 ? i : 0, 1);
  }
  return r;
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
    controle: ativa ? s.controle : ("nenhum" as EstadoControle),
    controlePor: s.controlePor,
    encerradaEm: s.encerradaEm?.toISOString() ?? (expirada ? expira.toISOString() : null),
    motivoFim: s.motivoFim ?? (expirada ? `Tempo máximo da sessão (${DURACAO_MAX_MS / 60_000} min) atingido.` : null),
  };
}

// ───────────────────────── armazenamento em memória ─────────────────────────
// globalThis sobrevive ao recarregamento de módulos do `next dev`.
const g = globalThis as unknown as { __labmakerTelas?: Map<string, SessaoTela>; __labmakerTelaEventos?: EventEmitter; __labmakerControleEventos?: EventEmitter };
const telas = (g.__labmakerTelas ??= new Map<string, SessaoTela>());
/** Avisa quem está assistindo (SSE) que chegou imagem nova ou que a sessão acabou. Evento = id do aparelho. */
export const telaEventos = (g.__labmakerTelaEventos ??= new EventEmitter().setMaxListeners(100));
/** Acorda o agente que está esperando eventos de controle (evento = id do aparelho). */
export const controleEventos = (g.__labmakerControleEventos ??= new EventEmitter().setMaxListeners(100));

export const TelaStore = {
  buscar: (dispositivoId: string) => telas.get(dispositivoId),
  iniciar(acaoId: string, dispositivoId: string, agora = new Date()) {
    const s: SessaoTela = {
      acaoId, dispositivoId, inicio: agora, ultimoQuadroEm: null, encerradaEm: null, motivoFim: null, quadro: null, versao: 0,
      controle: "nenhum", controlePor: null, controleDesde: null, fila: [], eventosEntregues: 0,
    };
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
    // o último quadro é descartado; o controle acaba junto
    Object.assign(s, { encerradaEm: agora, motivoFim: motivo, quadro: null, controle: "nenhum", fila: [] });
    telaEventos.emit(dispositivoId, { tipo: "fim", motivo });
    controleEventos.emit(dispositivoId);
    return s;
  },

  pedirControle(dispositivoId: string, por: string) {
    const s = telas.get(dispositivoId);
    if (!s) return;
    Object.assign(s, { controle: "pedido", controlePor: por });
    telaEventos.emit(dispositivoId, { tipo: "controle", estado: s.controle });
  },
  /** Resposta do usuário no computador (ou "indisponivel": o sistema dele não deixa controlar). */
  responderControle(dispositivoId: string, resposta: "aceito" | "recusado" | "indisponivel", agora = new Date()) {
    const s = telas.get(dispositivoId);
    if (!s) return;
    Object.assign(s, { controle: resposta === "aceito" ? "ativo" : resposta, controleDesde: resposta === "aceito" ? agora : null, fila: [] });
    telaEventos.emit(dispositivoId, { tipo: "controle", estado: s.controle });
  },
  /** O Líder devolve o controle (a tela continua ao vivo). Devolve quantos eventos foram aplicados. */
  soltarControle(dispositivoId: string) {
    const s = telas.get(dispositivoId);
    if (!s) return 0;
    const total = s.eventosEntregues;
    Object.assign(s, { controle: "nenhum", fila: [], controleDesde: null, eventosEntregues: 0 });
    telaEventos.emit(dispositivoId, { tipo: "controle", estado: s.controle });
    controleEventos.emit(dispositivoId);
    return total;
  },
  adicionarEventos(dispositivoId: string, eventos: EventoControle[]) {
    const s = telas.get(dispositivoId);
    if (!s || s.controle !== "ativo") return false;
    s.fila = empilharEventos(s.fila, eventos);
    controleEventos.emit(dispositivoId);
    return true;
  },
  retirarEventos(dispositivoId: string) {
    const s = telas.get(dispositivoId);
    if (!s) return [];
    const e = s.fila;
    s.fila = [];
    s.eventosEntregues += e.length;
    return e;
  },
};
