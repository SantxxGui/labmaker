"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, Hourglass, Keyboard, Maximize2, MonitorUp, MousePointer2, Send, ShieldCheck, Square, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ATALHOS, degrausDaRoda, pixelsDaRoda, pontoNaImagem, sequenciaAtalho } from "@/lib/controle-remoto";
import { cn } from "@/lib/utils";

type Controle = "nenhum" | "pedido" | "ativo" | "recusado" | "indisponivel";
type Estado = {
  sessao: {
    ativa: boolean; inicio?: string; expiraEm?: string; ultimoQuadroEm?: string | null; sinal?: "ao-vivo" | "sem-sinal" | "encerrada";
    motivoFim?: string | null; encerradaEm?: string | null; controle?: Controle; controlePor?: string | null;
  };
  pedido: { id: string; status: "PENDENTE" | "ENTREGUE" | "EXECUTADA" | "RECUSADA" | "FALHOU" | "CANCELADA"; criadoEm: string; motivo: string | null; justificativa: string | null } | null;
};
type Evento =
  | { t: "m"; x: number; y: number }
  | { t: "b"; b: 0 | 1 | 2; d: boolean; x: number; y: number }
  | { t: "w"; dy: number; x: number; y: number }
  | { t: "k"; c: string; d: boolean }
  | { t: "txt"; s: string };

const mmss = (ms: number) => `${String(Math.floor(Math.max(0, ms) / 60_000)).padStart(2, "0")}:${String(Math.floor((Math.max(0, ms) % 60_000) / 1000)).padStart(2, "0")}`;

/**
 * Tela de um aparelho com AGENTE REAL. Mostra a tela de verdade enquanto o usuário autoriza
 * (1 quadro/s), o tempo que falta, e o botão para encerrar. Sem sessão, explica o próximo passo.
 *
 * Controle remoto (tipo AnyDesk): com a tela ao vivo, "Controlar" pede um SEGUNDO "Permitir" ao
 * usuário. Permitido, o mouse, os cliques, a roda e o teclado do Líder sobre a imagem vão para o
 * computador em lotes a cada 40 ms; a tela passa a ~4 quadros/s.
 */
export function TelaRemotaAoVivo({ dispositivoId, hostname, online, podeComandar, controlavel, onPedir }: {
  dispositivoId: string; hostname: string; online: boolean; podeComandar: boolean;
  /** agente instalado em Windows ou Linux (no celular e no macOS não dá para controlar) */
  controlavel: boolean;
  onPedir: () => void;
}) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [quadro, setQuadro] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [encerrando, setEncerrando] = useState(false);
  const [pedindoControle, setPedindoControle] = useState(false);
  const [focada, setFocada] = useState(false);
  const [textoColar, setTextoColar] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const imagem = useRef<HTMLImageElement>(null);
  const camada = useRef<HTMLDivElement>(null);
  const ativa = !!estado?.sessao.ativa;
  const controle: Controle = (ativa && estado?.sessao.controle) || "nenhum";
  const controlando = controle === "ativo";

  const ler = useCallback(() => fetch(`/api/dispositivos/${dispositivoId}/tela`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null)).then((j) => j && setEstado(j)).catch(() => {}), [dispositivoId]);

  // situação do pedido/sessão a cada 2 s (1 s enquanto se espera a resposta do controle)
  useEffect(() => {
    if (!podeComandar) return;
    void ler();
    const t = setInterval(() => void ler(), controle === "pedido" ? 1000 : 2000);
    return () => clearInterval(t);
  }, [ler, podeComandar, controle]);

  // avisa quando o usuário responde ao pedido de controle
  const controleAnterior = useRef<Controle>("nenhum");
  useEffect(() => {
    const antes = controleAnterior.current;
    controleAnterior.current = controle;
    if (antes !== "pedido") return;
    if (controle === "ativo") { toast.success(`Controle permitido: clique na tela de ${hostname} e use mouse e teclado.`); camada.current?.focus(); }
    if (controle === "recusado") toast.error("O usuário não permitiu o controle. Você continua vendo a tela.");
    if (controle === "indisponivel") toast.error("Este computador não permite controle remoto (no Linux precisa de X11 + xdotool; no macOS não há).");
  }, [controle, hostname]);

  // Quadros: o servidor avisa por SSE quando chega imagem nova; só então baixamos (nada de baixar a mesma tela).
  // Se o SSE cair (proxy que não deixa conexão aberta), volta a buscar a cada ~1 s.
  useEffect(() => {
    if (!ativa) { setQuadro((q) => { if (q) URL.revokeObjectURL(q); return null; }); return; }
    let vivo = true, baixando = false, pendente = false, mostrada = -1;
    let reserva: ReturnType<typeof setTimeout> | undefined;
    const baixar = async (versao?: number) => {
      if (versao !== undefined && versao <= mostrada) return;
      if (baixando) { pendente = true; return; }
      baixando = true;
      try {
        const r = await fetch(`/api/dispositivos/${dispositivoId}/tela/imagem?v=${versao ?? Date.now()}`, { cache: "no-store" });
        if (r.ok && vivo) {
          const url = URL.createObjectURL(await r.blob());
          if (versao !== undefined) mostrada = versao;
          setQuadro((antigo) => { if (antigo) URL.revokeObjectURL(antigo); return url; });
        }
      } catch { /* próxima */ }
      baixando = false;
      if (pendente && vivo) { pendente = false; void baixar(); }
    };
    const sondar = async () => { await baixar(); if (vivo) reserva = setTimeout(sondar, 1000); };

    let fonte: EventSource | null = null;
    try {
      fonte = new EventSource(`/api/dispositivos/${dispositivoId}/tela/eventos`);
      const aoQuadro = (e: MessageEvent) => { const d = JSON.parse(e.data); if (d.versao > 0) void baixar(d.versao); };
      fonte.addEventListener("estado", aoQuadro);
      fonte.addEventListener("quadro", aoQuadro);
      fonte.addEventListener("controle", () => void ler());
      fonte.onerror = () => { if (fonte?.readyState === EventSource.CLOSED && vivo && !reserva) void sondar(); };
    } catch { void sondar(); }
    return () => { vivo = false; fonte?.close(); clearTimeout(reserva); };
  }, [ativa, dispositivoId, ler]);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── envio dos eventos: fila local, lotes a cada 40 ms, um pedido por vez
  const fila = useRef<Evento[]>([]);
  const enviando = useRef(false);
  const apertadas = useRef(new Set<string>());
  const botoes = useRef(new Set<0 | 1 | 2>());
  const roda = useRef(0);
  const ultimoPonto = useRef({ x: 0.5, y: 0.5 });
  const enfileirar = useCallback((...e: Evento[]) => {
    for (const ev of e) {
      const ultimo = fila.current.at(-1);
      if (ev.t === "m" && ultimo?.t === "m") fila.current[fila.current.length - 1] = ev; // só importa onde o mouse parou
      else fila.current.push(ev);
    }
  }, []);
  useEffect(() => {
    if (!controlando) { fila.current = []; return; }
    const t = setInterval(async () => {
      if (enviando.current || !fila.current.length) return;
      const lote = fila.current.splice(0, 200);
      enviando.current = true;
      try {
        const r = await fetch(`/api/dispositivos/${dispositivoId}/tela/controle`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventos: lote }),
        });
        if (r.status === 409) { fila.current = []; void ler(); }
      } catch { /* rede: o próximo lote tenta de novo */ }
      enviando.current = false;
    }, 40);
    return () => clearInterval(t);
  }, [controlando, dispositivoId, ler]);

  /** Solta tudo o que o Líder deixou apertado (ao sair da tela, perder o foco ou devolver o controle). */
  const soltarTudo = useCallback(() => {
    for (const c of apertadas.current) enfileirar({ t: "k", c, d: false });
    for (const b of botoes.current) enfileirar({ t: "b", b, d: false, ...ultimoPonto.current });
    apertadas.current.clear();
    botoes.current.clear();
  }, [enfileirar]);

  const ponto = (e: { clientX: number; clientY: number }) => {
    const img = imagem.current;
    if (!img) return null;
    const p = pontoNaImagem(e.clientX, e.clientY, img.getBoundingClientRect(), { w: img.naturalWidth, h: img.naturalHeight });
    if (p) ultimoPonto.current = p;
    return p;
  };
  const botaoDe = (b: number): 0 | 1 | 2 | null => (b === 0 ? 0 : b === 1 ? 1 : b === 2 ? 2 : null);

  function aoMover(e: React.PointerEvent) {
    if (!controlando) return;
    const p = ponto(e);
    if (p) enfileirar({ t: "m", ...p });
  }
  function aoBotao(e: React.PointerEvent, desce: boolean) {
    if (!controlando) return;
    e.preventDefault();
    camada.current?.focus();
    const b = botaoDe(e.button), p = ponto(e);
    if (b === null || !p) return;
    if (desce) { botoes.current.add(b); (e.target as Element).setPointerCapture?.(e.pointerId); } else botoes.current.delete(b);
    enfileirar({ t: "b", b, d: desce, ...p });
  }
  // roda: listener nativo (o do React é passivo e não deixa impedir a rolagem da página)
  useEffect(() => {
    const el = camada.current;
    if (!el || !controlando) return;
    const aoRodar = (e: WheelEvent) => {
      e.preventDefault();
      const p = ponto(e);
      if (!p) return;
      const { degraus, resto } = degrausDaRoda(roda.current + pixelsDaRoda(e.deltaY, e.deltaMode));
      roda.current = resto;
      if (degraus) enfileirar({ t: "w", dy: degraus, ...p });
    };
    el.addEventListener("wheel", aoRodar, { passive: false });
    return () => el.removeEventListener("wheel", aoRodar);
  }, [controlando, enfileirar]);
  function aoTecla(e: React.KeyboardEvent, desce: boolean) {
    if (!controlando || !e.code) return;
    e.preventDefault();
    if (desce) apertadas.current.add(e.code); else apertadas.current.delete(e.code);
    enfileirar({ t: "k", c: e.code, d: desce });
  }

  useEffect(() => { if (!controlando) { apertadas.current.clear(); botoes.current.clear(); } }, [controlando]);

  async function controleAcao(acao: "pedir" | "soltar") {
    setPedindoControle(true);
    try {
      if (acao === "soltar") soltarTudo();
      const r = await fetch(`/api/dispositivos/${dispositivoId}/tela/controle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }) });
      if (!r.ok) toast.error((await r.json().catch(() => ({}))).error ?? "Não foi possível.");
      else if (acao === "pedir") toast.message(`Pedido enviado: ${hostname} precisa clicar em “Permitir”.`);
      else toast.success(controle === "pedido" ? "Pedido de controle cancelado." : "Controle devolvido. Você continua vendo a tela.");
      await ler();
    } finally { setPedindoControle(false); }
  }

  async function telaCheia() {
    await caixa.current?.requestFullscreen?.().catch(() => {});
    // em tela cheia, o Chrome/Edge deixam capturar Esc, tecla Windows, Alt+Tab…
    const kb = (navigator as Navigator & { keyboard?: { lock?: () => Promise<void> } }).keyboard;
    if (controlando) await kb?.lock?.().catch(() => {});
    camada.current?.focus();
  }

  function colar() {
    const s = (textoColar ?? "").slice(0, 2000);
    if (s) enfileirar({ t: "txt", s });
    setTextoColar(null);
    camada.current?.focus();
  }

  async function encerrar() {
    setEncerrando(true);
    try {
      soltarTudo();
      const r = await fetch(`/api/dispositivos/${dispositivoId}/tela/encerrar`, { method: "POST" });
      if (!r.ok) toast.error((await r.json().catch(() => ({}))).error ?? "Não foi possível encerrar.");
      else toast.success("Compartilhamento encerrado.");
    } finally { setEncerrando(false); }
  }

  const pedido = estado?.pedido;
  const recente = pedido && agora - new Date(pedido.criadoEm).getTime() < 30 * 60_000;
  const aguardando = !ativa && recente && (pedido!.status === "PENDENTE" || pedido!.status === "ENTREGUE");
  const recusado = !ativa && recente && pedido!.status === "RECUSADA";
  const encerrada = !ativa && estado?.sessao.sinal === "encerrada" && estado.sessao.encerradaEm && agora - new Date(estado.sessao.encerradaEm).getTime() < 10 * 60_000;
  const falta = ativa && estado?.sessao.expiraEm ? new Date(estado.sessao.expiraEm).getTime() - agora : 0;

  return (
    <div ref={caixa} className="relative bg-black">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface/80 px-4 py-2.5">
        <p className="flex min-w-0 items-center gap-2 text-[12.5px]">
          {ativa ? (
            <>
              <span className={cn("size-2 shrink-0 rounded-full", estado?.sessao.sinal === "sem-sinal" ? "bg-warn" : "led-pulse bg-danger")} />
              <span className="font-medium text-fg">{estado?.sessao.sinal === "sem-sinal" ? "Sem sinal do computador…" : controlando ? "Controlando" : "Ao vivo"}</span>
              <span className="truncate text-subtle">
                · tela de {hostname} · {controlando ? "mouse e teclado seus" : controle === "pedido" ? "aguardando permitir o controle…" : "só visualização"} · termina em {mmss(falta)}
              </span>
            </>
          ) : (
            <><MonitorUp className="size-4 shrink-0 text-subtle" /><span className="text-muted">Tela do computador · agente real</span></>
          )}
        </p>
        {ativa && (
          <div className="flex shrink-0 gap-1.5">
            {controlavel && podeComandar && (
              controlando ? (
                <Button size="sm" variant="secondary" loading={pedindoControle} onClick={() => controleAcao("soltar")}><Undo2 />Devolver controle</Button>
              ) : (
                controle === "pedido" ? (
                  // agente antigo nunca responde: dá para desistir do pedido
                  <Button size="sm" variant="secondary" loading={pedindoControle} onClick={() => controleAcao("soltar")} title="Cancelar o pedido de controle">
                    <Hourglass className="animate-pulse" />Aguardando… cancelar
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" loading={pedindoControle} onClick={() => controleAcao("pedir")} title="O usuário precisa clicar em Permitir no computador">
                    <MousePointer2 />Controlar
                  </Button>
                )
              )
            )}
            <Button size="sm" variant="ghost" onClick={telaCheia} aria-label="Tela cheia"><Maximize2 /></Button>
            <Button size="sm" variant="danger" loading={encerrando} onClick={encerrar}><Square />Encerrar</Button>
          </div>
        )}
      </div>

      {controlando && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-surface/60 px-3 py-2 text-[12px]">
          <span className={cn("mr-1 flex items-center gap-1.5", focada ? "text-ok" : "text-warn")}>
            <Keyboard className="size-3.5" />{focada ? "Teclado indo para o computador" : "Clique na tela para usar o teclado"}
          </span>
          {Object.entries(ATALHOS).map(([k, a]) => (
            <button key={k} onClick={() => { enfileirar(...sequenciaAtalho(a.teclas)); camada.current?.focus(); }}
              className="rounded-md border border-line-strong px-2 py-1 text-muted hover:bg-white/5 hover:text-fg">{a.nome}</button>
          ))}
          {textoColar === null ? (
            <button onClick={() => setTextoColar("")} className="rounded-md border border-line-strong px-2 py-1 text-muted hover:bg-white/5 hover:text-fg">Colar texto…</button>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); colar(); }} className="flex min-w-[16rem] flex-1 gap-1.5">
              <input autoFocus value={textoColar} onChange={(e) => setTextoColar(e.target.value)} maxLength={2000} placeholder="Texto para digitar no computador (ex.: um endereço)"
                className="h-7 min-w-0 flex-1 rounded-md border border-line-strong bg-black/40 px-2 text-[12px] focus:border-accent focus:outline-none" />
              <Button size="sm" type="submit" disabled={!textoColar}><Send />Digitar</Button>
            </form>
          )}
        </div>
      )}

      <div className="grid aspect-video place-items-center">
        {ativa && quadro ? (
          <div
            ref={camada}
            tabIndex={controlando ? 0 : -1}
            aria-label={controlando ? `Tela de ${hostname}: mouse e teclado vão para o computador` : undefined}
            onPointerMove={aoMover}
            onPointerDown={(e) => aoBotao(e, true)}
            onPointerUp={(e) => aoBotao(e, false)}
            onContextMenu={(e) => controlando && e.preventDefault()}
            onKeyDown={(e) => aoTecla(e, true)}
            onKeyUp={(e) => aoTecla(e, false)}
            onFocus={() => setFocada(true)}
            onBlur={() => { setFocada(false); soltarTudo(); }}
            className={cn("relative size-full outline-none", controlando && "cursor-default touch-none ring-2 ring-inset", controlando && (focada ? "ring-ok/60" : "ring-warn/40"))}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={imagem} src={quadro} alt={`Tela compartilhada de ${hostname}`} draggable={false} className="pointer-events-none size-full select-none object-contain" />
            {controle === "pedido" && (
              <p className="absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-black/80 px-4 py-2 text-[12.5px] text-fg shadow-pop">
                <Hourglass className="mr-1.5 inline size-3.5 animate-pulse text-signal" />Aguardando {hostname} clicar em “Permitir” para você controlar…
              </p>
            )}
          </div>
        ) : (
          <div className="max-w-md space-y-3 px-6 text-center">
            {ativa ? (
              <><Eye className="mx-auto size-7 text-signal" /><p className="text-sm text-muted">Autorizado. Recebendo a primeira imagem…</p></>
            ) : aguardando ? (
              <>
                <Hourglass className="mx-auto size-7 animate-pulse text-signal" />
                <p className="text-sm text-fg">Aguardando {hostname} autorizar</p>
                <p className="text-[12.5px] text-subtle">Uma janela “Permitir / Recusar” abriu no computador. {pedido!.status === "PENDENTE" ? "O pedido sai no próximo check-in (até 15 s)." : "O pedido já chegou."}</p>
              </>
            ) : recusado ? (
              <>
                <XCircle className="mx-auto size-7 text-danger" />
                <p className="text-sm text-fg">Pedido recusado</p>
                <p className="text-[12.5px] text-subtle">{pedido!.motivo ?? "O usuário não autorizou."}</p>
              </>
            ) : (
              <>
                {encerrada ? <ShieldCheck className="mx-auto size-7 text-ok" /> : <MonitorUp className="mx-auto size-7 text-subtle" />}
                <p className="text-sm text-fg">{encerrada ? "Sessão encerrada" : "Nenhuma tela compartilhada"}</p>
                <p className="text-[12.5px] text-subtle">
                  {encerrada
                    ? estado!.sessao.motivoFim
                    : `Peça acesso: o usuário precisa autorizar no próprio computador, vê um aviso o tempo todo e pode encerrar quando quiser. Máximo de 30 min.${controlavel ? " Com a tela aberta, dá para pedir o controle do mouse e do teclado." : ""}`}
                </p>
                {podeComandar && (
                  <Button size="sm" variant="secondary" onClick={onPedir} disabled={!online} title={online ? undefined : "O computador precisa estar online"}>
                    <MonitorUp />Pedir acesso à tela
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
