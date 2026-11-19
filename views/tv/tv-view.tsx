"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, CalendarClock, Expand, LifeBuoy, Wrench } from "lucide-react";
import { Logo } from "@/components/logo";
import type { SituacaoTv, TvDTO } from "@/lib/tv";
import { cn } from "@/lib/utils";

const INTERVALO_MS = 5000;

const SITUACAO: Record<SituacaoTv, { rotulo: string; cor: string; borda: string; ponto: string }> = {
  LIVRE: { rotulo: "Livre", cor: "text-ok", borda: "border-ok/25", ponto: "bg-ok" },
  RESERVADA: { rotulo: "Em uso", cor: "text-info", borda: "border-info/30", ponto: "bg-info" },
  OPERANDO: { rotulo: "Operando", cor: "text-signal", borda: "border-signal/40", ponto: "bg-signal" },
  ALARME: { rotulo: "Alarme", cor: "text-danger", borda: "border-danger/50", ponto: "bg-danger" },
  MANUTENCAO: { rotulo: "Manutenção", cor: "text-subtle", borda: "border-line", ponto: "bg-subtle" },
};

const hhmm = (d: string | Date) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(d));
const minutosDesde = (d: string, agora: number) => Math.max(0, Math.round((agora - new Date(d).getTime()) / 60_000));

export function TvView() {
  const [tv, setTv] = useState<TvDTO | null>(null);
  const [erro, setErro] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const raiz = useRef<HTMLDivElement>(null);
  // projetor 1366×768 / 1280×720: layout compacto e listas menores
  const [curta, setCurta] = useState(false);
  useEffect(() => {
    const medir = () => setCurta(window.innerHeight < 900);
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  const buscar = useCallback(async () => {
    try {
      const r = await fetch("/api/tv", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setTv(await r.json());
      setErro(false);
    } catch {
      setErro(true); // mantém a última tela e tenta de novo
    }
  }, []);

  useEffect(() => {
    buscar();
    const t = setInterval(buscar, INTERVALO_MS);
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(relogio); };
  }, [buscar]);

  // F = tela cheia (para o monitor da recepção)
  const telaCheia = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void raiz.current?.requestFullscreen?.();
  }, []);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key.toLowerCase() === "f") telaCheia(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [telaCheia]);

  const relogio = new Date(agora);
  const dataBruta = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(relogio);
  const data = dataBruta.charAt(0).toUpperCase() + dataBruta.slice(1);
  const segundosAtras = tv ? Math.round((agora - new Date(tv.geradoEm).getTime()) / 1000) : 0;

  return (
    <div ref={raiz} className={cn("flex h-dvh flex-col overflow-hidden bg-bg text-fg", curta ? "gap-3 px-6 py-4" : "gap-5 px-8 py-6 2xl:px-12 2xl:py-8")}>
      {/* Cabeçalho */}
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Logo className="[&_span]:text-[22px]" />
          <span className="hidden h-6 w-px bg-line sm:block" />
          <p className="hidden text-[15px] text-muted sm:block">Espaço Maker</p>
        </div>
        <div className="flex items-center gap-5">
          {tv && (
            <span className={cn("flex items-center gap-2 rounded-full border px-4 py-1.5 text-[15px]", tv.espaco.aberto ? "border-ok/30 text-ok" : "border-line text-muted")}>
              <span className={cn("size-2 rounded-full", tv.espaco.aberto ? "animate-pulse bg-ok" : "bg-subtle")} />
              {tv.espaco.aberto ? `Aberto até ${tv.espaco.fechamento}h` : `Fechado · abre às ${tv.espaco.abertura}h`}
            </span>
          )}
          <div className="text-right">
            <p className={cn("font-mono font-semibold leading-none tracking-tight tabular-nums", curta ? "text-[32px]" : "text-[40px] 2xl:text-[52px]")}>{hhmm(relogio)}</p>
            <p className="mt-1 text-[13px] text-muted">{data}</p>
          </div>
        </div>
      </header>

      {!tv ? (
        <div className="grid flex-1 place-items-center text-muted">{erro ? "Sem conexão com o servidor. Tentando de novo…" : "Carregando o espaço…"}</div>
      ) : (
        <>
          {/* Números grandes */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Numero curta={curta} rotulo="Máquinas livres" valor={tv.resumo.livres} de={tv.resumo.maquinas} cor="text-ok" />
            <Numero curta={curta} rotulo="Em uso agora" valor={tv.resumo.emUso} cor="text-info" />
            <Numero curta={curta} rotulo="Aparelhos conectados" valor={tv.aparelhos.online} de={tv.aparelhos.total} />
            <Numero curta={curta} rotulo="Notebooks emprestados" valor={tv.aparelhos.emprestados} extra={tv.aparelhos.atrasados ? `${tv.aparelhos.atrasados} atrasado${tv.aparelhos.atrasados > 1 ? "s" : ""}` : undefined} />
            <Numero curta={curta} rotulo="Pedidos de ajuda" valor={tv.atendimento.esperando} destaque={tv.atendimento.esperando > 0} extra={tv.atendimento.emAtendimento ? `${tv.atendimento.emAtendimento} em atendimento` : undefined} />
          </section>

          <div className={cn("grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_480px]", curta ? "gap-3" : "gap-5")}>
            {/* Máquinas */}
            <section className="min-h-0 overflow-hidden">
              <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.14em] text-subtle">Máquinas</h2>
              {tv.maquinas.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-muted">Nenhuma máquina cadastrada ainda. Quando o Líder cadastrar, elas aparecem aqui.</p>
              ) : (
                <div className={cn("grid sm:grid-cols-2 xl:grid-cols-3", curta ? "gap-2.5" : "gap-3")}>
                  <AnimatePresence initial={false}>
                    {tv.maquinas.map((m) => <CartaoMaquina key={m.id} m={m} curta={curta} />)}
                  </AnimatePresence>
                </div>
              )}
            </section>

            {/* Lateral */}
            <aside className={cn("flex min-h-0 flex-col overflow-hidden", curta ? "gap-3" : "gap-4")}>
              <Painel titulo="Próximas reservas" curta={curta} icone={<CalendarClock className="size-4" />}>
                {tv.proximas.length === 0 ? (
                  <p className="py-3 text-[14px] text-subtle">Nenhuma reserva para o resto do dia.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {tv.proximas.slice(0, curta ? 3 : 6).map((r) => {
                      const emCurso = new Date(r.inicio).getTime() <= agora;
                      return (
                        <li key={r.id} className={cn("flex items-center gap-3", curta ? "py-1.5" : "py-2.5")}>
                          <span className={cn("w-[112px] shrink-0 whitespace-nowrap font-mono text-[14px] tabular-nums", emCurso ? "text-info" : "text-fg")}>{hhmm(r.inicio)}–{hhmm(r.fim)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px]">{r.maquina}</span>
                            <span className="block text-[12.5px] text-subtle">{r.usuario} · {r.laboratorio}</span>
                          </span>
                          {emCurso && <span className="rounded-full bg-info-soft px-2 text-[11px] leading-5 text-info">agora</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Painel>

              <Painel titulo="Atendimento" curta={curta} icone={<LifeBuoy className="size-4" />} destaque={tv.atendimento.esperando > 0}>
                {tv.atendimento.fila.length === 0 ? (
                  <p className="py-3 text-[14px] text-subtle">Ninguém esperando. Precisa de ajuda? Toque em <span className="text-muted">Pedir ajuda ao Líder</span> no seu aparelho.</p>
                ) : (
                  <ul className="space-y-2">
                    {tv.atendimento.fila.map((c) => (
                      <motion.li key={c.numero} layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 text-[14.5px]">
                        <span className={cn("size-2 shrink-0 rounded-full", c.status === "ABERTO" ? "animate-pulse bg-signal" : "bg-info")} />
                        <span className="font-mono">#{c.numero}</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-muted">{c.aparelho}</span>
                        <span className="text-[12.5px] text-subtle">{c.status === "ABERTO" ? (minutosDesde(c.desde, agora) < 1 ? "chegou agora" : `esperando ${minutosDesde(c.desde, agora)} min`) : "em atendimento"}</span>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </Painel>

              <Painel titulo="Agora no espaço" curta={curta} className="min-h-0 flex-1 overflow-hidden">
                <ul className="space-y-2.5 overflow-hidden">
                  <AnimatePresence initial={false}>
                    {tv.atividade.slice(0, curta ? 3 : 8).map((a) => (
                      <motion.li key={a.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 text-[13.5px]">
                        <span className="w-11 shrink-0 font-mono text-subtle tabular-nums">{hhmm(a.quando)}</span>
                        <span className="min-w-0 text-muted">{a.texto}</span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                  {tv.atividade.length === 0 && <li className="text-[14px] text-subtle">Sem movimento ainda hoje.</li>}
                </ul>
              </Painel>
            </aside>
          </div>
        </>
      )}

      {/* Rodapé */}
      <footer className="flex items-center justify-between text-[12px] text-subtle">
        <Link href="/painel" className="flex items-center gap-1.5 hover:text-fg"><ArrowLeft className="size-3.5" />Voltar ao sistema</Link>
        <span className={cn("flex items-center gap-2", erro && "text-warn")}>
          <span className={cn("size-1.5 rounded-full", erro ? "bg-warn" : "bg-ok")} />
          {erro ? "Sem conexão — mostrando a última leitura" : `Ao vivo · atualizado há ${Math.max(0, segundosAtras)} s`}
        </span>
        <button onClick={telaCheia} className="flex items-center gap-1.5 hover:text-fg"><Expand className="size-3.5" />Tela cheia (F)</button>
      </footer>
    </div>
  );
}

function Numero({ rotulo, valor, de, cor, extra, destaque, curta }: { rotulo: string; valor: number; de?: number; cor?: string; extra?: string; destaque?: boolean; curta?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-surface/60 px-5 transition-colors", curta ? "py-2.5" : "py-4", destaque ? "border-signal/50 bg-signal/[0.06]" : "border-line")}>
      <p className="text-[13px] text-muted">{rotulo}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <motion.span key={valor} initial={{ opacity: 0.4, y: -4 }} animate={{ opacity: 1, y: 0 }} className={cn("font-semibold leading-none tabular-nums", curta ? "text-[30px]" : "text-[40px] 2xl:text-[48px]", destaque ? "text-signal" : cor ?? "text-fg")}>
          {valor}
        </motion.span>
        {de !== undefined && <span className="text-[18px] text-subtle tabular-nums">/ {de}</span>}
      </p>
      <p className={cn("mt-1.5 h-4 text-[12.5px]", extra?.includes("atrasad") ? "text-danger" : "text-subtle")}>{extra ?? ""}</p>
    </div>
  );
}

function Painel({ titulo, icone, destaque, curta, className, children }: { titulo: string; icone?: React.ReactNode; destaque?: boolean; curta?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("shrink-0 rounded-2xl border bg-surface/60 px-5", curta ? "py-3" : "py-4", destaque ? "border-signal/50" : "border-line", className)}>
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.14em] text-subtle">{icone}{titulo}</h2>
      {children}
    </section>
  );
}

function CartaoMaquina({ m, curta }: { m: TvDTO["maquinas"][number]; curta?: boolean }) {
  const s = SITUACAO[m.situacao];
  return (
    <motion.article layout initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
      className={cn("relative overflow-hidden rounded-2xl border bg-surface/60", curta ? "px-4 py-3" : "px-5 py-4", s.borda, m.situacao === "ALARME" && "bg-danger-soft/40")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("truncate font-semibold tracking-tight", curta ? "text-[15.5px]" : "text-[18px]")}>{m.nome}</p>
          <p className="font-mono text-[12px] text-subtle">{m.laboratorio}{!m.online && m.situacao !== "MANUTENCAO" ? " · sem sensor" : ""}</p>
        </div>
        <span className={cn("flex shrink-0 items-center gap-1.5 text-[13px] font-medium", s.cor)}>
          {m.situacao === "ALARME" ? <AlertTriangle className="size-4" /> : m.situacao === "MANUTENCAO" ? <Wrench className="size-3.5" /> : <span className={cn("size-2 rounded-full", s.ponto, m.situacao === "OPERANDO" && "animate-pulse")} />}
          {s.rotulo}
        </span>
      </div>

      {m.situacao === "OPERANDO" && m.progresso !== null && (
        <div className={curta ? "mt-2" : "mt-3"}>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div className="h-full rounded-full bg-signal" initial={false} animate={{ width: `${Math.round(m.progresso * 100)}%` }} transition={{ duration: 0.8 }} />
          </div>
          <p className="mt-1.5 flex justify-between text-[12.5px] text-muted">
            <span className="tabular-nums">{Math.round(m.progresso * 100)}%</span>
            {m.restanteMin !== null && <span>faltam {m.restanteMin} min</span>}
          </p>
        </div>
      )}

      {m.alarme && <p className={cn("mt-2 text-danger", curta ? "line-clamp-1 text-[12.5px]" : "text-[13px]")}>{m.alarme}</p>}

      <div className={cn("space-y-1 text-[13px]", curta ? "mt-2" : "mt-3")}>
        {m.agora && <p className="text-fg">{m.agora.usuario} <span className="text-subtle">até {hhmm(m.agora.fim)}</span></p>}
        {m.proxima ? (
          <p className="text-subtle">Próxima: <span className="text-muted">{m.proxima.usuario}</span> às {hhmm(m.proxima.inicio)}</p>
        ) : (
          !m.agora && m.situacao === "LIVRE" && <p className="text-subtle">Livre o resto do dia</p>
        )}
      </div>
    </motion.article>
  );
}

