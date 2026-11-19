"use client";

/** Peças visuais compartilhadas do módulo de dispositivos. */
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Laptop, Lock, Monitor, MousePointer2, ShieldAlert, Smartphone, Tablet, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { STATUS_ACAO_LABEL } from "@/lib/labels";
import type { SeveridadeAlarme, StatusAcao, TipoDispositivo } from "@/lib/types";
import { cn } from "@/lib/utils";

export const ICONE_DISPOSITIVO: Record<TipoDispositivo, React.ElementType> = {
  NOTEBOOK: Laptop, DESKTOP: Monitor, TABLET: Tablet, SMARTPHONE: Smartphone,
};

export function IconeDispositivo({ tipo, className }: { tipo: TipoDispositivo; className?: string }) {
  const I = ICONE_DISPOSITIVO[tipo];
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04]", className)}>
      <I className="size-4" strokeWidth={1.75} />
    </span>
  );
}

export function StatusDispositivo({ online, bloqueado, className }: { online: boolean; bloqueado: boolean; className?: string }) {
  if (bloqueado)
    return (
      <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border border-signal/35 bg-signal/10 px-2.5 text-xs font-medium text-signal", className)}>
        <Lock className="size-3" />Bloqueado
      </span>
    );
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border bg-black/30 px-2.5 text-xs font-medium", online ? "border-ok/25 text-ok" : "border-line text-subtle", className)}>
      <span className={cn("size-1.5 rounded-full", online ? "ao-vivo bg-ok text-ok" : "bg-zinc-600")} />
      {online ? "Online" : "Offline"}
    </span>
  );
}

/** Barra de uso (CPU/memória/disco) com cor por faixa e transição suave. */
export function BarraUso({ valor, className }: { valor: number | null; className?: string }) {
  const v = valor ?? 0;
  const cor = v >= 90 ? "bg-danger" : v >= 75 ? "bg-warn" : "bg-white/70";
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-white/[0.07]", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", valor === null ? "bg-transparent" : cor)} style={{ width: `${v}%` }} />
    </div>
  );
}

export const PRIORIDADE: Record<SeveridadeAlarme, { rotulo: string; classe: string; ponto: string }> = {
  INFO: { rotulo: "Informativo", classe: "border-info/30 bg-info-soft text-info", ponto: "bg-info" },
  AVISO: { rotulo: "Importante", classe: "border-warn/30 bg-warn-soft text-warn", ponto: "bg-warn" },
  CRITICO: { rotulo: "Crítico", classe: "border-danger/35 bg-danger-soft text-danger", ponto: "bg-danger" },
};

const STATUS_COR: Record<StatusAcao, string> = {
  PENDENTE: "border-line text-muted",
  ENTREGUE: "border-info/30 bg-info-soft text-info",
  EXECUTADA: "border-ok/30 bg-ok-soft text-ok",
  RECUSADA: "border-danger/30 bg-danger-soft text-danger",
};

/** Chip de status que anima quando a ação avança na fila. */
export function StatusAcaoChip({ status, alerta }: { status: StatusAcao; alerta?: boolean }) {
  const rotulo = alerta && status === "EXECUTADA" ? "Lido" : STATUS_ACAO_LABEL[status];
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={status}
        initial={{ opacity: 0, scale: 0.8, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: -4 }}
        transition={{ type: "spring", bounce: 0.4, duration: 0.45 }}
        className={cn("inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[10.5px] font-medium", STATUS_COR[status])}
      >
        {status === "PENDENTE" && <span className="size-1 rounded-full bg-current led-pulse" />}
        {rotulo}
      </motion.span>
    </AnimatePresence>
  );
}

export function ConformidadeChip({ pontuacao, conforme, semAgente }: { pontuacao: number; conforme: boolean; semAgente?: boolean }) {
  if (semAgente) return <span className="inline-flex h-6 items-center rounded-full border border-line px-2.5 text-[11px] text-subtle">sem agente</span>;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[11px]", conforme ? "border-ok/25 text-ok" : pontuacao >= 70 ? "border-warn/30 text-warn" : "border-danger/35 text-danger")}>
      {conforme ? "✓" : "!"} {pontuacao}%
    </span>
  );
}

// ───────────────────────── Notificação (prévia e na tela) ─────────────────────────

export type Notificacao = { titulo: string; mensagem: string; prioridade: SeveridadeAlarme };
type Estilo = "windows" | "macos" | "mobile";

/** Notificação como o agente exibe em cada sistema. */
export function CartaoNotificacao({ n, estilo, className }: { n: Notificacao; estilo: Estilo; className?: string }) {
  const p = PRIORIDADE[n.prioridade];
  if (estilo === "macos")
    return (
      <div className={cn("w-full rounded-2xl border border-white/15 bg-[#2a2a2e]/90 p-3 shadow-2xl backdrop-blur-xl", className)}>
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-black"><BellRing className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center justify-between text-[10px] uppercase tracking-wide text-white/50"><span>LabMaker</span><span>agora</span></p>
            <p className="mt-0.5 truncate text-[12.5px] font-semibold text-white">{n.titulo || "Título do alerta"}</p>
            <p className="line-clamp-2 text-[11.5px] leading-snug text-white/75">{n.mensagem || "Mensagem que o usuário vai ler."}</p>
          </div>
        </div>
      </div>
    );
  if (estilo === "mobile")
    return (
      <div className={cn("w-full rounded-[18px] border border-white/10 bg-[#1f1f23]/95 p-3 shadow-2xl backdrop-blur-xl", className)}>
        <p className="flex items-center gap-1.5 text-[10px] text-white/55"><span className={cn("size-1.5 rounded-full", p.ponto)} />LabMaker · agora</p>
        <p className="mt-1 truncate text-[12.5px] font-semibold text-white">{n.titulo || "Título do alerta"}</p>
        <p className="line-clamp-3 text-[11.5px] leading-snug text-white/75">{n.mensagem || "Mensagem que o usuário vai ler."}</p>
      </div>
    );
  return (
    <div className={cn("w-full overflow-hidden rounded-md border border-white/10 bg-[#202020]/95 shadow-2xl backdrop-blur-xl", className)}>
      <div className={cn("h-0.5", p.ponto)} />
      <div className="p-3">
        <p className="flex items-center gap-1.5 text-[10.5px] text-white/60"><BellRing className="size-3" />LabMaker · Espaço Maker</p>
        <p className="mt-1.5 text-[12.5px] font-semibold text-white">{n.titulo || "Título do alerta"}</p>
        <p className="mt-0.5 line-clamp-3 text-[11.5px] leading-snug text-white/75">{n.mensagem || "Mensagem que o usuário vai ler."}</p>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <span className="rounded bg-white/10 py-1 text-center text-[10.5px] text-white">Li e entendi</span>
          <span className="rounded bg-white/[0.05] py-1 text-center text-[10.5px] text-white/60">Lembrar depois</span>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Tela simulada do dispositivo ─────────────────────────

/**
 * O que o usuário está vendo agora (simulação). No produto real, a tela só é transmitida
 * durante uma sessão de suporte remoto autorizada pelo usuário.
 */
export function TelaDispositivo({ tipo, online, bloqueado, appAtivo, usuario, notificacao, sessao, className }: {
  tipo: TipoDispositivo;
  online: boolean;
  bloqueado: boolean;
  appAtivo: string | null;
  usuario: string | null;
  notificacao?: (Notificacao & { chave: string }) | null;
  /** "aguardando" = pedido enviado; "ativa" = usuário autorizou */
  sessao?: "aguardando" | "ativa" | null;
  className?: string;
}) {
  const mobile = tipo === "TABLET" || tipo === "SMARTPHONE";
  const [hora, setHora] = useState("");
  useEffect(() => {
    const f = () => setHora(new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date()));
    f();
    const id = setInterval(f, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={cn(
        "varredura relative overflow-hidden bg-[#0b0c0e]",
        tipo === "SMARTPHONE" ? "mx-auto aspect-[9/17] w-[230px] rounded-[30px] border-[6px] border-zinc-800" :
        tipo === "TABLET" ? "mx-auto aspect-[4/3] w-full max-w-[560px] rounded-[22px] border-[10px] border-zinc-800" :
        "aspect-video w-full",
        sessao === "ativa" && "ring-2 ring-danger ring-offset-2 ring-offset-bg",
        className,
      )}
    >
      {!online ? (
        <div className="absolute inset-0 grid place-items-center bg-black">
          <div className="text-center">
            <WifiOff className="mx-auto size-7 text-subtle" />
            <p className="mt-3 font-mono text-sm text-muted">Sem conexão com o agente</p>
            <p className="mt-1 text-xs text-subtle">Ações enviadas ficam na fila até o próximo check-in.</p>
          </div>
        </div>
      ) : bloqueado ? (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,#1c1407,#070605_70%)]">
          <div className="text-center">
            <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", bounce: 0.5 }} className="mx-auto grid size-14 place-items-center rounded-full border border-signal/40 bg-signal/10">
              <Lock className="size-6 text-signal" />
            </motion.span>
            <p className="mt-4 text-[15px] font-semibold text-white">Bloqueado pela equipe do espaço</p>
            <p className="mt-1 text-xs text-white/60">Procure o Líder no balcão do espaço maker</p>
            <p className="mt-5 font-mono text-[28px] font-light text-white/80">{hora}</p>
          </div>
        </div>
      ) : (
        <>
          {/* "papel de parede" técnico */}
          <div className="absolute inset-0 bg-grid opacity-60" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(245,158,11,0.08),transparent_60%)]" />
          {/* janela do app em uso */}
          <AnimatePresence mode="wait">
            <motion.div
              key={appAtivo ?? "vazio"}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35 }}
              className={cn("absolute overflow-hidden rounded-md border border-white/10 bg-[#141518] shadow-2xl", mobile ? "inset-3 top-8" : "left-[8%] right-[18%] top-[9%] bottom-[16%]")}
            >
              <div className="flex h-6 items-center gap-1.5 border-b border-white/10 bg-white/[0.04] px-2">
                {!mobile && [0, 1, 2].map((k) => <span key={k} className="size-2 rounded-full bg-white/20" />)}
                <span className="ml-1 truncate text-[10px] text-white/60">{appAtivo ?? "Área de trabalho"}</span>
              </div>
              <ConteudoApp app={appAtivo} />
            </motion.div>
          </AnimatePresence>
          {/* barra de tarefas / status */}
          {mobile ? (
            <div className="absolute inset-x-0 top-0 flex h-6 items-center justify-between px-4 text-[10px] text-white/70"><span>{hora}</span><span>LabMaker · gerenciado</span></div>
          ) : (
            <div className="absolute inset-x-0 bottom-0 flex h-7 items-center gap-2 border-t border-white/10 bg-black/60 px-3 backdrop-blur">
              <span className="size-3.5 rounded-sm bg-white/30" />
              {[0, 1, 2, 3].map((k) => <span key={k} className={cn("size-3.5 rounded-sm", k === 1 ? "bg-white/50" : "bg-white/15")} />)}
              <span className="ml-auto text-[10px] text-white/70">{usuario ?? ""}</span>
              <span className="font-mono text-[10px] text-white/70">{hora}</span>
            </div>
          )}
          {/* cursor do Líder durante a sessão remota */}
          {sessao === "ativa" && (
            <motion.div
              className="absolute z-20"
              initial={{ left: "30%", top: "35%" }}
              animate={{ left: ["30%", "58%", "44%", "66%", "30%"], top: ["35%", "55%", "28%", "62%", "35%"] }}
              transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
            >
              <MousePointer2 className="size-5 fill-danger text-white drop-shadow" />
              <span className="ml-3 rounded bg-danger px-1.5 py-0.5 text-[9.5px] font-medium text-white">Líder</span>
            </motion.div>
          )}
        </>
      )}

      {/* faixa de sessão remota */}
      <AnimatePresence>
        {online && sessao && (
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
            className={cn("absolute inset-x-0 top-0 z-30 flex items-center justify-center gap-2 py-1 text-[10.5px] font-medium text-white", sessao === "ativa" ? "bg-danger" : "bg-info/90")}
          >
            <ShieldAlert className="size-3" />
            {sessao === "ativa" ? "Sessão de suporte remoto em andamento · o usuário pode encerrar a qualquer momento" : "Aguardando o usuário autorizar o suporte remoto…"}
          </motion.div>
        )}
      </AnimatePresence>

      {/* notificação chegando */}
      <AnimatePresence>
        {online && notificacao && (
          <motion.div
            key={notificacao.chave}
            initial={{ opacity: 0, x: mobile ? 0 : 40, y: mobile ? -40 : 0 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: mobile ? 0 : 40, y: mobile ? -40 : 0 }}
            transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
            className={cn("absolute z-40", mobile ? "inset-x-3 top-7" : "bottom-10 right-3 w-[46%] min-w-[200px]")}
          >
            <CartaoNotificacao n={notificacao} estilo={mobile ? "mobile" : "windows"} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ───────────────────────── conteúdo de cada app (simulação) ─────────────────────────

function tipoConteudo(app: string | null) {
  if (!app) return "vazio";
  if (/Fusion|Blender|KiCad|Prusa|Bambu|Cura|LightBurn|Inkscape|Silhouette/.test(app)) return "cad";
  if (/365/.test(app)) return "grafico";
  if (/Teams/.test(app)) return "chat";
  if (/QR|Câmera|LabMaker Mobile/.test(app)) return "scanner";
  if (/Code|Python|Arduino/.test(app)) return "codigo";
  return "web";
}

function ConteudoApp({ app }: { app: string | null }) {
  const t = tipoConteudo(app);
  if (t === "cad")
    return (
      <div className="relative grid h-[calc(100%-24px)] place-items-center">
        <svg viewBox="-60 -60 120 120" className="h-[80%] text-white/60" aria-hidden>
          <g className="origin-center animate-[spin_14s_linear_infinite]" style={{ transformBox: "fill-box" }}>
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <ellipse key={k} cx="0" cy="0" rx="46" ry={14 + k * 6} fill="none" stroke="currentColor" strokeWidth="0.6" transform={`rotate(${k * 30})`} />
            ))}
            <circle r="14" fill="none" stroke="#f59e0b" strokeWidth="1.2" />
          </g>
        </svg>
        <span className="absolute bottom-2 left-3 font-mono text-[9px] text-white/40">X 124.502 · Y 88.190 · Z 12.000</span>
      </div>
    );
  if (t === "grafico") {
    const pts = Array.from({ length: 24 }, (_, i) => 30 + Math.sin(i / 2.2) * 12 + ((i * 37) % 11) - 5);
    return (
      <div className="h-[calc(100%-24px)] p-3">
        <div className="mb-2 grid grid-cols-4 gap-1">
          {["Peças", "Horas", "Filamento", "Turmas"].map((k, i) => (
            <div key={k} className="rounded bg-white/[0.05] px-1.5 py-1"><p className="text-[8px] text-white/40">{k}</p><p className="font-mono text-[10px] text-white/80">{["128", "342", "9,6 kg", "14"][i]}</p></div>
          ))}
        </div>
        <svg viewBox="0 0 230 60" preserveAspectRatio="none" className="h-[60%] w-full" aria-hidden>
          <line x1="0" x2="230" y1="14" y2="14" stroke="#fb7185" strokeDasharray="3 3" strokeWidth="0.6" />
          <line x1="0" x2="230" y1="50" y2="50" stroke="#fb7185" strokeDasharray="3 3" strokeWidth="0.6" />
          <motion.polyline initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: "easeInOut" }}
            fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.2" points={pts.map((v, i) => `${i * 10},${v}`).join(" ")} />
        </svg>
      </div>
    );
  }
  if (t === "chat")
    return (
      <div className="space-y-2 p-3">
        {[["Prof. Ricardo", "A peça do Rover já saiu da impressora?", false], ["Você", "Saiu! Está no balcão, etiqueta 14.", true], ["Prof. Ricardo", "Perfeito, obrigado!", false]].map(([q, m, eu], k) => (
          <motion.div key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + k * 0.5 }} className={cn("max-w-[75%] rounded-lg px-2 py-1.5", eu ? "ml-auto bg-indigo-500/30" : "bg-white/[0.07]")}>
            <p className="text-[8.5px] text-white/50">{q}</p>
            <p className="text-[10px] text-white/85">{m}</p>
          </motion.div>
        ))}
      </div>
    );
  if (t === "scanner")
    return (
      <div className="relative grid h-[calc(100%-24px)] place-items-center bg-black/40">
        <div className="relative size-[55%] max-h-32 max-w-32">
          {["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2", "left-0 bottom-0 border-l-2 border-b-2", "right-0 bottom-0 border-r-2 border-b-2"].map((c) => (
            <span key={c} className={cn("absolute size-5 border-signal", c)} />
          ))}
          <motion.span className="absolute inset-x-1 h-0.5 bg-signal shadow-[0_0_12px_#f59e0b]" animate={{ top: ["8%", "92%", "8%"] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
        </div>
        <span className="absolute bottom-2 text-[9px] text-white/50">Aponte para a etiqueta do notebook</span>
      </div>
    );
  if (t === "codigo")
    return (
      <div className="space-y-1 p-3 font-mono text-[9.5px] leading-tight">
        {[["text-sky-300", "#include", " <Servo.h>"], ["text-sky-300", "Servo", " garra;"], ["text-white/40", "// braço robótico — TCC", ""], ["text-sky-300", "void", " setup() { garra.attach(9); }"], ["text-sky-300", "void", " loop() { garra.write(90); }"]].map(([c, a, b], k) => (
          <motion.p key={k} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.15 }}>
            <span className="mr-3 text-white/25">{k + 1}</span><span className={c}>{a}</span><span className="text-white/75">{b}</span>
          </motion.p>
        ))}
        <span className="inline-block h-3 w-1.5 translate-x-6 bg-white/70 led-pulse" />
      </div>
    );
  return (
    <div className="p-3">
      <div className="mb-2 h-4 rounded-full bg-white/[0.06] px-2 text-[8.5px] leading-4 text-white/40">tinkercad.com · Projeto Rover</div>
      <div className="space-y-1.5">
        {[80, 62, 90, 45, 70].map((w, k) => (
          <motion.div key={k} className="h-1.5 rounded-full bg-white/[0.09]" initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ delay: 0.1 + k * 0.05, duration: 0.5 }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">{[0, 1, 2].map((k) => <div key={k} className="aspect-[4/3] rounded bg-white/[0.05]" />)}</div>
    </div>
  );
}
