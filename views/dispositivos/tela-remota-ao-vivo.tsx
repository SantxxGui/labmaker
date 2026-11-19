"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, Hourglass, Maximize2, MonitorUp, ShieldCheck, Square, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Estado = {
  sessao: { ativa: boolean; inicio?: string; expiraEm?: string; ultimoQuadroEm?: string | null; sinal?: "ao-vivo" | "sem-sinal" | "encerrada"; motivoFim?: string | null; encerradaEm?: string | null };
  pedido: { id: string; status: "PENDENTE" | "ENTREGUE" | "EXECUTADA" | "RECUSADA" | "FALHOU" | "CANCELADA"; criadoEm: string; motivo: string | null; justificativa: string | null } | null;
};

const mmss = (ms: number) => `${String(Math.floor(Math.max(0, ms) / 60_000)).padStart(2, "0")}:${String(Math.floor((Math.max(0, ms) % 60_000) / 1000)).padStart(2, "0")}`;

/**
 * Tela de um aparelho com AGENTE REAL. Mostra a tela de verdade enquanto o usuário autoriza
 * (1 quadro/s), o tempo que falta, e o botão para encerrar. Sem sessão, explica o próximo passo.
 */
export function TelaRemotaAoVivo({ dispositivoId, hostname, online, podeComandar, onPedir }: {
  dispositivoId: string; hostname: string; online: boolean; podeComandar: boolean; onPedir: () => void;
}) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [quadro, setQuadro] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [encerrando, setEncerrando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const ativa = !!estado?.sessao.ativa;

  // situação do pedido/sessão a cada 2 s
  useEffect(() => {
    if (!podeComandar) return;
    let vivo = true;
    const ler = () => fetch(`/api/dispositivos/${dispositivoId}/tela`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((j) => vivo && j && setEstado(j)).catch(() => {});
    ler();
    const t = setInterval(ler, 2000);
    return () => { vivo = false; clearInterval(t); };
  }, [dispositivoId, podeComandar]);

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
      fonte.onerror = () => { if (fonte?.readyState === EventSource.CLOSED && vivo && !reserva) void sondar(); };
    } catch { void sondar(); }
    return () => { vivo = false; fonte?.close(); clearTimeout(reserva); };
  }, [ativa, dispositivoId]);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function encerrar() {
    setEncerrando(true);
    try {
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
              <span className="font-medium text-fg">{estado?.sessao.sinal === "sem-sinal" ? "Sem sinal do computador…" : "Ao vivo"}</span>
              <span className="truncate text-subtle">· tela de {hostname} · só visualização · termina em {mmss(falta)}</span>
            </>
          ) : (
            <><MonitorUp className="size-4 shrink-0 text-subtle" /><span className="text-muted">Tela do computador · agente real</span></>
          )}
        </p>
        {ativa && (
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => caixa.current?.requestFullscreen?.()} aria-label="Tela cheia"><Maximize2 /></Button>
            <Button size="sm" variant="danger" loading={encerrando} onClick={encerrar}><Square />Encerrar</Button>
          </div>
        )}
      </div>

      <div className="grid aspect-video place-items-center">
        {ativa && quadro ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={quadro} alt={`Tela compartilhada de ${hostname}`} className="size-full object-contain" />
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
                  {encerrada ? estado!.sessao.motivoFim : "Peça acesso: o usuário precisa autorizar no próprio computador, vê um aviso o tempo todo e pode encerrar quando quiser. Máximo de 10 min."}
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
