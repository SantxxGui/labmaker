"use client";

/**
 * Janelinha de ajuda — o chat do "Pedir ajuda ao Líder" no computador.
 *
 * O agente cria o chamado na hora do clique e abre /ajuda#t=CHAVE numa janela de app (Edge/Chrome
 * sem barra de endereço). A chave fica depois do # (não vai para o servidor nos logs) e só serve
 * para o chat do chamado daquele aparelho. A janela lê a conversa a cada 2 s — e, enquanto está
 * aberta, o agente não precisa abrir outra quando o Líder escreve.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, LifeBuoy, MonitorUp, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Msg = { id: string; autor: "USUARIO" | "LIDER" | "SISTEMA"; autorNome: string | null; texto: string; criadoEm: string };
type Chamado = {
  id: string; numero: number; status: "ABERTO" | "EM_ATENDIMENTO"; autorizaTela: boolean;
  descricao: string | null; atendente: string | null; mensagens: Msg[];
};
type Estado = { hostname: string; chamado: Chamado | null };

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function JanelaAjuda() {
  const [chave, setChave] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [encerrado, setEncerrado] = useState<{ numero: number; cancelado: boolean } | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const ultimo = useRef<Chamado | null>(null);
  const cancelouAqui = useRef(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get("t");
    if (t) setChave(t);
    else setErro("Abra esta janela pelo atalho “Pedir ajuda ao Líder” na área de trabalho.");
  }, []);

  const chamar = useCallback(
    async (caminho: string, corpo: unknown = {}) => {
      const r = await fetch(caminho, {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
        body: JSON.stringify(corpo),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) setErro(j.error ?? "Esta janela venceu. Clique de novo em “Pedir ajuda ao Líder”.");
      if (!r.ok) throw new Error(j.error ?? `Erro ${r.status}`);
      return j;
    },
    [chave],
  );

  const ler = useCallback(
    async (extra?: { autorizaTela?: boolean }) => {
      if (!chave) return;
      try {
        const j: Estado = await chamar("/api/agente/chamados/estado", extra ?? {});
        // o chamado sumiu: o Líder resolveu (ou a pessoa cancelou aqui)
        if (ultimo.current && !j.chamado) setEncerrado({ numero: ultimo.current.numero, cancelado: cancelouAqui.current });
        if (j.chamado) { setEncerrado(null); cancelouAqui.current = false; }
        ultimo.current = j.chamado;
        setEstado(j);
      } catch { /* tenta de novo no próximo ciclo */ }
    },
    [chave, chamar],
  );

  useEffect(() => {
    if (!chave) return;
    void ler();
    const t = setInterval(() => void ler(), 2000);
    return () => clearInterval(t);
  }, [chave, ler]);

  // título da janela pisca quando o Líder escreve e a janela está em segundo plano
  const qtd = estado?.chamado?.mensagens.length ?? 0;
  const vistas = useRef(0);
  useEffect(() => {
    rolagem.current?.scrollTo({ top: rolagem.current.scrollHeight, behavior: "smooth" });
    const ultimaDoLider = estado?.chamado?.mensagens.at(-1)?.autor === "LIDER";
    if (document.hidden && ultimaDoLider && qtd > vistas.current) document.title = "(nova mensagem) LabMaker · Ajuda";
    if (!document.hidden) vistas.current = qtd;
  }, [qtd, estado?.chamado?.mensagens]);
  useEffect(() => {
    const voltar = () => { if (!document.hidden) { document.title = "LabMaker · Ajuda"; vistas.current = qtd; } };
    document.addEventListener("visibilitychange", voltar);
    return () => document.removeEventListener("visibilitychange", voltar);
  }, [qtd]);

  async function enviar(e?: React.FormEvent) {
    e?.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      await chamar("/api/agente/chamados/mensagem", { texto: t });
      setTexto("");
      await ler();
    } catch (err) {
      setErro((err as Error).message);
      setTimeout(() => setErro((x) => (x === (err as Error).message ? null : x)), 4000);
    } finally {
      setEnviando(false);
      campo.current?.focus();
    }
  }

  async function cancelar() {
    cancelouAqui.current = true;
    await chamar("/api/agente/chamados/cancelar").catch(() => {});
    await ler();
  }

  async function pedirDeNovo() {
    await chamar("/api/agente/chamados", {}).catch(() => {});
    setEncerrado(null);
    await ler();
    campo.current?.focus();
  }

  const c = estado?.chamado;
  const vencida = erro?.includes("venceu") || erro?.includes("atalho");

  return (
    <main className="flex h-dvh flex-col bg-bg text-fg">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-signal/15"><LifeBuoy className="size-5 text-signal" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold tracking-tight">{c ? `Pedido de ajuda #${c.numero}` : "Ajuda do espaço maker"}</p>
          <p className="truncate text-[12px] text-muted">
            {c
              ? c.status === "EM_ATENDIMENTO"
                ? `${c.atendente?.split(" ")[0] ?? "O Líder"} está atendendo você`
                : "Na fila do Líder: ele já foi avisado"
              : estado?.hostname ?? "LabMaker"}
          </p>
        </div>
        {c && <span className={cn("size-2 shrink-0 rounded-full", c.status === "EM_ATENDIMENTO" ? "bg-ok" : "led-pulse bg-signal")} aria-hidden />}
      </header>

      {vencida ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div className="space-y-2">
            <LifeBuoy className="mx-auto size-8 text-subtle" />
            <p className="text-[14px]">{erro}</p>
          </div>
        </div>
      ) : encerrado && !c ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div className="space-y-3">
            <CheckCircle2 className="mx-auto size-9 text-ok" />
            <p className="text-[15px] font-medium">{encerrado.cancelado ? "Pedido cancelado" : "Atendimento encerrado"}</p>
            <p className="text-[13px] text-muted">{encerrado.cancelado ? "Que bom que resolveu!" : `O Líder encerrou o pedido #${encerrado.numero}. Pode fechar esta janela.`}</p>
            <button onClick={pedirDeNovo} className="mt-2 h-10 rounded-xl border border-line-strong px-4 text-[13px] hover:bg-white/5">Pedir ajuda de novo</button>
          </div>
        </div>
      ) : (
        <>
          <div ref={rolagem} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4" aria-live="polite">
            {!c ? (
              <p className="py-10 text-center text-[13px] text-subtle">Abrindo seu pedido…</p>
            ) : (
              <>
                <div className="rounded-xl border border-line bg-white/[0.03] px-3.5 py-3 text-[13px] text-muted">
                  <p className="font-medium text-fg">O Líder do espaço já recebeu seu pedido.</p>
                  <p className="mt-0.5">{c.descricao ? "Ele responde por aqui." : "Conte aqui o que está acontecendo (ex.: “o Inkscape não abre”)."}</p>
                </div>
                {c.mensagens.map((m) =>
                  m.autor === "SISTEMA" ? (
                    <p key={m.id} className="text-center text-[11.5px] text-subtle">{m.texto}</p>
                  ) : (
                    <div key={m.id} className={cn("flex", m.autor === "USUARIO" ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px]", m.autor === "USUARIO" ? "rounded-br-md bg-white text-zinc-950" : "rounded-bl-md border border-line bg-surface")}>
                        {m.autor === "LIDER" && <p className="text-[11px] font-medium text-signal">{m.autorNome?.split(" ")[0] ?? "Líder"}</p>}
                        <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                        <p className={cn("mt-0.5 text-right text-[10.5px]", m.autor === "USUARIO" ? "text-zinc-500" : "text-subtle")}>{hora(m.criadoEm)}</p>
                      </div>
                    </div>
                  ),
                )}
              </>
            )}
          </div>

          {c && (
            <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-line px-4 py-2.5">
              <span className="flex items-center gap-2 text-[12.5px] text-muted">
                <MonitorUp className="size-4 text-subtle" />O Líder pode ver minha tela durante o atendimento
              </span>
              <Switch checked={c.autorizaTela} onCheckedChange={(v) => void ler({ autorizaTela: v })} aria-label="O Líder pode ver minha tela" />
            </label>
          )}

          <form onSubmit={enviar} className="flex items-end gap-2 border-t border-line p-3">
            <textarea
              ref={campo} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1000} rows={1} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
              placeholder={c?.descricao ? "Escreva uma mensagem" : "O que está acontecendo?"} aria-label="Mensagem" disabled={!c}
              className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-line-strong bg-black/30 px-3 py-2.5 text-[14px] focus:border-accent focus:outline-none"
            />
            <button disabled={enviando || !texto.trim() || !c} aria-label="Enviar" className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-zinc-950 disabled:opacity-40">
              <Send className="size-4" />
            </button>
          </form>
          {erro && <p className="px-4 pb-2 text-[12px] text-danger">{erro}</p>}
          {c && <button onClick={cancelar} className="pb-3 text-[12px] text-subtle hover:text-danger">Já resolvi, cancelar pedido</button>}
        </>
      )}
    </main>
  );
}
