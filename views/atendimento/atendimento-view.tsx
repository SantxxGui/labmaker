"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { CheckCircle2, Headset, Inbox, LifeBuoy, MonitorUp, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import type { ChamadoDTO } from "@/lib/types";
import { cn, tempoRelativo } from "@/lib/utils";
import { IconeDispositivo } from "@/views/dispositivos/dispositivo-ui";
import { TelaRemotaAoVivo } from "@/views/dispositivos/tela-remota-ao-vivo";

const STATUS: Record<ChamadoDTO["status"], { rotulo: string; cls: string }> = {
  ABERTO: { rotulo: "Esperando", cls: "border-signal/40 bg-signal/10 text-signal" },
  EM_ATENDIMENTO: { rotulo: "Em atendimento", cls: "border-info/30 bg-info-soft text-info" },
  RESOLVIDO: { rotulo: "Resolvido", cls: "border-ok/30 bg-ok-soft text-ok" },
  CANCELADO: { rotulo: "Cancelado", cls: "border-line text-subtle" },
};

const hora = (d: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(d));

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Falha na comunicação.");
  return j as T;
}

export function AtendimentoView({ inicial, selecionadoInicial }: { inicial: ChamadoDTO[]; selecionadoInicial: string | null }) {
  const [fila, setFila] = useState(inicial);
  const [selId, setSelId] = useState<string | null>(selecionadoInicial ?? inicial.find((c) => c.status !== "RESOLVIDO" && c.status !== "CANCELADO")?.id ?? null);
  const [sel, setSel] = useState<ChamadoDTO | null>(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [mostrarTela, setMostrarTela] = useState(false);
  const rolagem = useRef<HTMLDivElement>(null);

  // fila a cada 4 s
  useEffect(() => {
    let vivo = true;
    const t = setInterval(() => api<{ chamados: ChamadoDTO[] }>("/api/chamados").then((j) => vivo && setFila(j.chamados)).catch(() => {}), 4000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  // conversa selecionada a cada 2 s
  const carregar = useCallback(async () => {
    if (!selId) return setSel(null);
    try { setSel((await api<{ chamado: ChamadoDTO }>(`/api/chamados/${selId}`)).chamado); } catch { /* tenta de novo */ }
  }, [selId]);
  useEffect(() => {
    setMostrarTela(false);
    carregar();
    const t = setInterval(carregar, 2000);
    return () => clearInterval(t);
  }, [carregar]);

  const qtdMsgs = sel?.mensagens?.length ?? 0;
  // rola só a conversa (scrollIntoView rolaria a página inteira)
  useEffect(() => { const el = rolagem.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [qtdMsgs, selId]);

  async function acao(nome: string, fn: () => Promise<unknown>, ok?: string) {
    setOcupado(nome);
    try { await fn(); if (ok) toast.success(ok); await carregar(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setOcupado(null); }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || !sel) return;
    setTexto("");
    await acao("enviar", () => api(`/api/chamados/${sel.id}/mensagens`, { method: "POST", body: JSON.stringify({ texto: t }) }));
  }

  const abertos = fila.filter((c) => c.status === "ABERTO").length;
  const encerrado = sel?.status === "RESOLVIDO" || sel?.status === "CANCELADO";
  const podeTela = sel && sel.dispositivo.agenteReal && sel.dispositivo.tipo !== "SMARTPHONE" && sel.dispositivo.tipo !== "TABLET";
  const comTela = !!podeTela && !encerrado && (mostrarTela || sel?.status === "EM_ATENDIMENTO");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Suporte"
        title="Atendimento"
        description="Pedidos de ajuda que os alunos abrem pelo notebook (atalho “Pedir ajuda ao Líder”) ou pelo celular. Converse, veja a tela com autorização e encerre o atendimento."
        actions={<span className="rounded-full border border-line px-3 py-1.5 text-[12px] text-muted">{abertos ? `${abertos} esperando` : "Ninguém esperando"}</span>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* Fila */}
        <Card className="flex flex-col overflow-hidden p-0 lg:h-[calc(100dvh-14rem)] lg:min-h-[520px]">
          <p className="flex items-center gap-2 border-b border-line px-4 py-3 text-[13px] font-medium"><Inbox className="size-4 text-subtle" />Fila</p>
          <ul className="max-h-[50vh] min-h-0 flex-1 overflow-y-auto lg:max-h-none">
            {fila.length === 0 && (
              <li className="px-5 py-12 text-center text-[13px] text-muted">
                <LifeBuoy className="mx-auto mb-3 size-6 text-subtle" />
                Nenhum pedido ainda. Quando alguém tocar em <span className="text-fg">Pedir ajuda</span> no notebook ou no celular, aparece aqui.
              </li>
            )}
            <AnimatePresence initial={false}>
              {fila.map((c) => (
                <motion.li key={c.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                  <button
                    onClick={() => setSelId(c.id)}
                    className={cn("flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors hover:bg-white/[0.03]", selId === c.id && "bg-white/[0.05]")}
                  >
                    <IconeDispositivo tipo={c.dispositivo.tipo} className="mt-0.5 size-4 shrink-0 text-subtle" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[12.5px] text-fg">{c.dispositivo.hostname}</span>
                        <span className={cn("shrink-0 rounded-full border px-2 text-[10px] leading-5", STATUS[c.status].cls)}>{STATUS[c.status].rotulo}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-muted">#{c.numero} · {c.descricao}</span>
                      <span className="mt-0.5 block text-[11px] text-subtle">{c.nomeSolicitante ?? "—"} · {tempoRelativo(c.criadoEm)}</span>
                    </span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </Card>

        {/* Conversa */}
        <Card className="flex min-h-[60vh] flex-col overflow-hidden p-0 lg:h-[calc(100dvh-14rem)] lg:min-h-[520px]">
          {!sel ? (
            <div className="grid flex-1 place-items-center px-6 text-center text-[13px] text-muted">
              <div><Headset className="mx-auto mb-3 size-7 text-subtle" />Escolha um pedido na fila.</div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                    Pedido #{sel.numero}
                    <span className={cn("rounded-full border px-2 text-[10.5px] font-normal leading-5", STATUS[sel.status].cls)}>{STATUS[sel.status].rotulo}</span>
                  </p>
                  <p className="mt-1 text-[13px] text-muted">{sel.descricao}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-subtle">
                    <Link href={`/dispositivos/${sel.dispositivo.id}`} className="font-mono text-muted hover:text-fg hover:underline">{sel.dispositivo.hostname}</Link>
                    <span className="flex items-center gap-1.5"><span className={cn("size-1.5 rounded-full", sel.dispositivo.online ? "bg-ok" : "bg-subtle")} />{sel.dispositivo.online ? "online" : "offline"}</span>
                    {sel.nomeSolicitante && <span>{sel.nomeSolicitante}</span>}
                    {sel.autorizaTela && <span className="flex items-center gap-1 text-ok"><ShieldCheck className="size-3.5" />autorizou ver a tela</span>}
                    {sel.atendidoPor && <span>atendido por {sel.atendidoPor.nome.split(" ")[0]}</span>}
                  </p>
                </div>
                {!encerrado && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {sel.status === "ABERTO" && (
                      <Button size="sm" loading={ocupado === "atender"} onClick={() => acao("atender", () => api(`/api/chamados/${sel.id}/atender`, { method: "POST" }), "Você está atendendo.")}><Headset />Atender</Button>
                    )}
                    {podeTela && (
                      <Button size="sm" variant="secondary" loading={ocupado === "tela"} disabled={!sel.dispositivo.online}
                        onClick={() => acao("tela", async () => { await api(`/api/chamados/${sel.id}/tela`, { method: "POST" }); setMostrarTela(true); }, sel.autorizaTela ? "Abrindo a tela (pré-autorizada)." : "Pedido enviado: o aluno precisa permitir.")}>
                        <MonitorUp />Ver tela
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" loading={ocupado === "resolver"} onClick={() => acao("resolver", () => api(`/api/chamados/${sel.id}/resolver`, { method: "POST" }), "Atendimento encerrado.")}><CheckCircle2 />Encerrar</Button>
                  </div>
                )}
              </div>

              <div className={cn("grid min-h-0 flex-1", comTela && "xl:grid-cols-[minmax(0,1fr)_360px]")}>
              {comTela && (
                <div className="min-h-0 overflow-y-auto border-b border-line xl:border-b-0 xl:border-r">
                  <TelaRemotaAoVivo
                    dispositivoId={sel.dispositivo.id} hostname={sel.dispositivo.hostname} online={sel.dispositivo.online} podeComandar
                    onPedir={() => acao("tela", () => api(`/api/chamados/${sel.id}/tela`, { method: "POST" }))}
                  />
                </div>
              )}

              <div className="flex min-h-0 flex-col">
              <div ref={rolagem} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-live="polite">
                {(sel.mensagens ?? []).length === 0 && <p className="py-6 text-center text-[13px] text-subtle">Nenhuma mensagem ainda. Escreva abaixo: chega no aparelho em poucos segundos.</p>}
                {(sel.mensagens ?? []).map((m) =>
                  m.autor === "SISTEMA" ? (
                    <p key={m.id} className="text-center text-[11.5px] text-subtle">{m.texto} · {hora(m.criadoEm)}</p>
                  ) : (
                    <div key={m.id} className={cn("flex", m.autor === "LIDER" ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[78%] rounded-2xl px-3.5 py-2 text-[13.5px]", m.autor === "LIDER" ? "rounded-br-md bg-white text-zinc-950" : "rounded-bl-md border border-line bg-surface text-fg")}>
                        <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                        <p className={cn("mt-0.5 text-[10.5px]", m.autor === "LIDER" ? "text-zinc-500" : "text-subtle")}>
                          {m.autor === "LIDER" ? (m.entregueEm ? "entregue" : "enviando…") : m.autorNome ?? "aluno"} · {hora(m.criadoEm)}
                        </p>
                      </div>
                    </div>
                  ),
                )}
              </div>

              {!encerrado ? (
                <form onSubmit={enviar} className="flex gap-2 border-t border-line p-3">
                  <input
                    value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1000} placeholder={`Escreva para ${sel.nomeSolicitante ?? sel.dispositivo.hostname}…`}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-black/30 px-3 text-[13.5px] focus:border-accent focus:outline-none" aria-label="Mensagem"
                  />
                  <Button type="submit" loading={ocupado === "enviar"} disabled={!texto.trim()}><Send />Enviar</Button>
                </form>
              ) : (
                <p className="border-t border-line px-5 py-3 text-center text-[12.5px] text-subtle">Atendimento encerrado {sel.resolvidoEm ? tempoRelativo(sel.resolvidoEm) : ""}.</p>
              )}
              </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
