"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CalendarClock, Cctv, Download, Laptop, Monitor, Radio, ScrollText, ShieldCheck, Smartphone, Tablet } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const ABAS = [
  { id: "maquinas", rotulo: "Máquinas", icone: Radio },
  { id: "dispositivos", rotulo: "Notebooks", icone: Laptop },
  { id: "reservas", rotulo: "Reservas", icone: CalendarClock },
  { id: "auditoria", rotulo: "Auditoria", icone: ScrollText },
] as const;
type Aba = (typeof ABAS)[number]["id"];
const DURACAO = 7000;

/** Relógio que avança a cada `ms` — dá vida aos números das telas de exemplo. */
function useTique(ms = 1200) {
  const [t, setT] = useState(0);
  const reduzir = useReducedMotion();
  useEffect(() => {
    if (reduzir) return;
    const id = setInterval(() => setT((v) => v + 1), ms);
    return () => clearInterval(id);
  }, [ms, reduzir]);
  return t;
}

export function Vitrine() {
  const [aba, setAba] = useState<Aba>("maquinas");
  const [pausado, setPausado] = useState(false);
  const [inicio, setInicio] = useState(() => Date.now());
  const reduzir = useReducedMotion();

  useEffect(() => {
    if (pausado || reduzir) return;
    const id = setTimeout(() => {
      setAba((a) => ABAS[(ABAS.findIndex((x) => x.id === a) + 1) % ABAS.length].id);
      setInicio(Date.now());
    }, DURACAO - (Date.now() - inicio));
    return () => clearTimeout(id);
  }, [aba, pausado, reduzir, inicio]);

  return (
    <div onMouseEnter={() => setPausado(true)} onMouseLeave={() => { setPausado(false); setInicio(Date.now()); }}
      className="glass overflow-hidden rounded-2xl border border-line-strong text-left shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
      <div className="flex h-11 items-center gap-2 border-b border-line px-4">
        {[0, 1, 2].map((k) => <span key={k} className="size-2.5 rounded-full bg-white/15" />)}
        <span className="ml-3 hidden font-mono text-[11px] text-subtle sm:inline">labmaker.app/{aba === "dispositivos" ? "dispositivos" : aba === "maquinas" ? "equipamentos" : aba}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10.5px] text-ok"><span className="ao-vivo size-1.5 rounded-full bg-ok" />ao vivo</span>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 no-scrollbar">
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => { setAba(a.id); setInicio(Date.now()); }}
            className={cn("relative flex shrink-0 items-center gap-2 overflow-hidden rounded-lg px-3 py-1.5 text-[13px] transition-colors", aba === a.id ? "bg-white/[0.08] text-fg" : "text-subtle hover:text-fg")}>
            <a.icone className="size-3.5" />{a.rotulo}
            {aba === a.id && !pausado && !reduzir && (
              <motion.span key={inicio} className="absolute bottom-0 left-0 h-0.5 bg-signal" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: (DURACAO - (Date.now() - inicio)) / 1000, ease: "linear" }} />
            )}
          </button>
        ))}
      </div>
      <div className="relative h-[430px] overflow-hidden p-5 sm:h-[380px]">
        <AnimatePresence mode="wait">
          <motion.div key={aba} initial={{ opacity: 0, y: 16, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -10, filter: "blur(6px)" }} transition={{ duration: 0.4 }} className="h-full">
            {aba === "maquinas" && <TelaMaquinas />}
            {aba === "dispositivos" && <TelaDispositivos />}
            {aba === "reservas" && <TelaReservas />}
            {aba === "auditoria" && <TelaAuditoria />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Spark({ semente, alerta }: { semente: number; alerta?: boolean }) {
  const t = useTique(900);
  const pts = Array.from({ length: 16 }, (_, i) => 16 + Math.sin((i + t) / 2 + semente) * 7 + (((i + t) * (semente + 3)) % 5) + (alerta ? i * 0.8 : 0));
  return (
    <svg viewBox="0 0 150 40" className="h-9 w-full" aria-hidden>
      <polyline fill="none" stroke={alerta ? "var(--danger)" : "rgba(255,255,255,.75)"} strokeWidth="1.4" points={pts.map((v, i) => `${i * 10},${40 - v}`).join(" ")} style={{ transition: "all .8s" }} />
    </svg>
  );
}

function TelaMaquinas() {
  const t = useTique(1000);
  const maquinas = [
    { n: "Impressora 3D Bambu X1C", ip: "10.20.30.13", e: "Imprimindo", v: (215 + Math.round(Math.sin(t / 2) * 1)).toString(), u: "°C bico", p: (38 + t) % 100 },
    { n: "Laser CO2 #2", ip: "10.20.30.22", e: "Alarme", v: (28.4 + (t % 5) * 0.1).toFixed(1).replace(".", ","), u: "°C água", alarme: "W-201 · Água do chiller quente" },
    { n: "Plotter Roland", ip: "10.20.30.32", e: "Cortando", v: (118 + (t % 7)).toString(), u: "g lâmina", p: (61 + t * 2) % 100 },
  ];
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Online", "7/8"], ["Em uso agora", `${4 + (t % 3 === 0 ? 1 : 0)}`], ["Peças hoje", `${21 + Math.floor(t / 6)}`], ["Alarmes", "3"]].map(([l, v], i) => (
          <div key={l} className={cn("rounded-xl border bg-black/25 p-3.5", i === 3 ? "border-danger/40" : "border-line")}>
            <p className="eyebrow !text-[9.5px]">{l}</p>
            <p className={cn("mt-2 text-2xl font-semibold tabular-nums tracking-tight", i === 3 && "text-danger")}>{v}</p>
          </div>
        ))}
      </div>
      <div className="grid flex-1 gap-3 md:grid-cols-3">
        {maquinas.map((m, i) => (
          <div key={m.n} className={cn("flex flex-col rounded-xl border bg-black/25 p-3.5", m.alarme ? "alarm-ring border-danger/40" : "border-line")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{m.n}</p>
                <p className="font-mono text-[10.5px] text-subtle">{m.ip}</p>
              </div>
              <span className={cn("flex items-center gap-1 rounded-full border px-2 text-[10.5px] leading-5", m.alarme ? "border-danger/40 text-danger" : "border-ok/30 text-ok")}>
                <span className={cn("size-1.5 rounded-full led-pulse", m.alarme ? "bg-danger" : "bg-ok")} />{m.e}
              </span>
            </div>
            <div className="mt-auto flex items-end justify-between gap-3 pt-3">
              <p className={cn("font-mono text-xl tabular-nums", m.alarme && "text-danger")}>{m.v}<span className="ml-1 text-[11px] text-subtle">{m.u}</span></p>
              <div className="w-28"><Spark semente={i * 2} alerta={!!m.alarme} /></div>
            </div>
            {m.alarme ? (
              <p className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger-soft px-2 py-1 text-[11px] text-danger"><AlertTriangle className="size-3" />{m.alarme}</p>
            ) : (
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-ok/80 transition-[width] duration-700" style={{ width: `${m.p}%` }} /></div>
            )}
            <p className="mt-2 flex items-center gap-1 font-mono text-[10px] text-subtle"><Cctv className="size-3" />câmera ao vivo</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TelaDispositivos() {
  const t = useTique(1400);
  const linhas = [
    { h: "LM-NB-01", u: "Ana Ribeiro · Fusion 360", i: Laptop, s: "86%", ok: false, cpu: 40 + ((t * 7) % 30) },
    { h: "LM-NB-02", u: "Diego Souza · Arduino IDE", i: Laptop, s: "100%", ok: true, cpu: 22 + ((t * 5) % 25) },
    { h: "LM-DT-LASER", u: "Estação do laser · LightBurn", i: Monitor, s: "100%", ok: true, cpu: 55 + ((t * 3) % 35) },
    { h: "LM-TB-BALCAO", u: "Quiosque de empréstimo", i: Tablet, s: "100%", ok: true, cpu: 10 + ((t * 4) % 12) },
    { h: "LM-NB-PROF", u: "Prof. Ricardo Nogueira", i: Laptop, s: "100%", ok: true, cpu: 8 + ((t * 6) % 10) },
  ];
  const eventos = ["Download bloqueado: MinecraftInstaller.exe", "Pendrive bloqueado na estação do laser", "Acesso bloqueado: site de apostas", "Aviso lido por Ana Ribeiro"];
  const ev = eventos[Math.floor(t / 2) % eventos.length];
  return (
    <div className="relative grid h-full gap-3 md:grid-cols-[1fr_220px]">
      <div className="overflow-hidden rounded-xl border border-line bg-black/25">
        {linhas.map((l, k) => (
          <div key={l.h} className="flex items-center gap-3 border-t border-line px-3.5 py-2.5 first:border-t-0">
            <span className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04]"><l.i className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[12.5px]">{l.h}</p>
              <p className="truncate text-[11px] text-subtle">{l.u}</p>
            </div>
            <span className="hidden items-center gap-1 rounded-full border border-ok/25 px-2 text-[10.5px] leading-5 text-ok sm:flex"><span className="ao-vivo size-1.5 rounded-full bg-ok" />Online</span>
            <div className="hidden w-20 sm:block">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-white/70 transition-[width] duration-700" style={{ width: `${l.cpu}%` }} /></div>
            </div>
            <span className={cn("rounded-full border px-2 font-mono text-[10.5px] leading-5", l.ok ? "border-ok/25 text-ok" : "border-warn/30 text-warn")}>{l.ok ? "✓" : "!"} {l.s}</span>
            {k === 0 && <span className="sr-only">antivírus desativado</span>}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-line bg-black/25 p-3.5">
          <p className="eyebrow !text-[9.5px]">Aviso enviado</p>
          <p className="mt-1.5 text-[12.5px] font-medium">O espaço fecha em 15 minutos</p>
          <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div className="h-full bg-ok transition-[width] duration-700" style={{ width: `${Math.min(86, 30 + t * 6)}%` }} />
          </div>
          <p className="mt-1.5 font-mono text-[10.5px] text-ok">{Math.min(11, 4 + t)} de 13 leram</p>
        </div>
        <div className="flex-1 rounded-xl border border-line bg-black/25 p-3.5">
          <p className="eyebrow flex items-center gap-1.5 !text-[9.5px]"><ShieldCheck className="size-3" />Conformidade</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">95%</p>
          <p className="mt-1 text-[11px] text-warn">4 fora da política</p>
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={ev} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ type: "spring", bounce: 0.3 }}
          className="absolute bottom-0 right-0 flex items-center gap-2 rounded-xl border border-warn/30 bg-[#1a1408]/95 px-3 py-2 text-[12px] text-warn shadow-2xl backdrop-blur">
          <Download className="size-3.5" />{ev}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function TelaReservas() {
  const t = useTique(700);
  const horas = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"];
  const equips = ["Impressora 3D Prusa #1", "Impressora 3D Bambu X1C", "Laser CO2 #1", "Plotter Roland"];
  const ocupado = (e: number, h: number) => ((e * 7 + h * 3) % 5 < 2) || (e * 6 + h) === t % 24;
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-[140px_repeat(6,1fr)] gap-1.5 text-[10.5px] text-subtle">
        <span />
        {horas.map((h) => <span key={h} className="text-center font-mono">{h}</span>)}
      </div>
      <div className="mt-2 flex-1 space-y-1.5">
        {equips.map((e, ei) => (
          <div key={e} className="grid grid-cols-[140px_repeat(6,1fr)] items-center gap-1.5">
            <span className="truncate text-[12px] text-muted">{e}</span>
            {horas.map((h, hi) => {
              const o = ocupado(ei, hi);
              const novo = ei * 6 + hi === t % 24;
              return (
                <motion.span key={h} layout animate={novo ? { scale: [1, 1.12, 1] } : {}} transition={{ duration: 0.5 }}
                  className={cn("h-9 rounded-md border text-center text-[10px] leading-9 transition-colors", novo ? "border-signal bg-signal/20 text-signal" : o ? "border-white/10 bg-white/[0.08] text-muted" : "border-ok/20 bg-ok-soft/40 text-ok")}>
                  {novo ? "reservando" : o ? "ocupado" : "livre"}
                </motion.span>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-black/25 px-3 py-2 text-[12px] text-muted">
        <ShieldCheck className="size-3.5 text-ok" />Trava transacional por equipamento: duas pessoas nunca reservam o mesmo horário.
      </p>
    </div>
  );
}

function TelaAuditoria() {
  const t = useTique(1300);
  const log = [
    ["Paulo H. (OED)", "Aviso enviado", "O espaço fecha em 15 min → 13 notebooks", "warn"],
    ["Lucas M. (estagiário)", "Comando remoto", "Pausar impressão → Bambu X1C", "info"],
    ["Gateway", "Alarme", "W-201 Água do chiller quente · Laser #2", "danger"],
    ["Marina A.", "Política alterada", "Estações das máquinas: USB bloqueado", "warn"],
    ["Ana R. (aluna)", "Reserva criada", "Laser CO2 #1 · 14:00", "ok"],
    ["Paulo H. (OED)", "Ação em notebook", "Bloquear → LM-NB-07 (não devolvido)", "warn"],
    ["Lucas M. (estagiário)", "Calibração", "Prusa #2 · nivelamento da mesa", "ok"],
  ] as const;
  const visiveis = Array.from({ length: 6 }, (_, k) => log[(t + k) % log.length]);
  const cor = { danger: "text-danger border-danger/30", info: "text-info border-info/30", warn: "text-warn border-warn/30", ok: "text-ok border-ok/30" };
  return (
    <div className="h-full overflow-hidden rounded-xl border border-line bg-black/25">
      <AnimatePresence initial={false}>
        {visiveis.map(([q, a, d, c], k) => (
          <motion.div key={`${t}-${k}`} layout initial={k === 0 ? { opacity: 0, y: -20, backgroundColor: "rgba(245,158,11,0.12)" } : false} animate={{ opacity: 1, y: 0, backgroundColor: "rgba(0,0,0,0)" }} transition={{ duration: 0.5 }}
            className="grid grid-cols-[52px_1fr] gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
            <span className="pt-0.5 font-mono text-[11px] text-subtle">{`14:${String(59 - ((t + k) % 50)).padStart(2, "0")}`}</span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[12.5px]"><span className="font-medium">{q}</span><span className={cn("rounded-full border px-2 text-[10.5px] leading-5", cor[c])}>{a}</span></p>
              <p className="truncate text-[12px] text-muted">{d}</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
