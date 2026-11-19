/** Peças visuais compartilhadas do monitoramento de máquinas. */
import { ESTADO_LABEL } from "@/lib/labels";
import type { EstadoMaquina, MetricaDTO, SeveridadeAlarme } from "@/lib/types";
import { cn } from "@/lib/utils";

type Estado = EstadoMaquina | "MANUTENCAO";

export const ESTADO_COR: Record<Estado, { texto: string; led: string; borda: string }> = {
  OPERANDO: { texto: "text-ok", led: "bg-ok", borda: "border-ok/25" },
  OCIOSO: { texto: "text-muted", led: "bg-subtle", borda: "border-line" },
  PAUSADO: { texto: "text-warn", led: "bg-warn", borda: "border-warn/30" },
  ALARME: { texto: "text-danger", led: "bg-danger", borda: "border-danger/40" },
  MANUTENCAO: { texto: "text-signal", led: "bg-signal", borda: "border-signal/30" },
  OFFLINE: { texto: "text-subtle", led: "bg-zinc-600", borda: "border-line" },
};

export function EstadoBadge({ estado, className }: { estado: Estado; className?: string }) {
  const c = ESTADO_COR[estado];
  const pulsa = estado === "OPERANDO" || estado === "ALARME";
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border bg-black/30 px-2.5 text-xs font-medium", c.texto, c.borda, className)}>
      <span className={cn("size-1.5 rounded-full", c.led, pulsa && "led-pulse")} />
      {ESTADO_LABEL[estado]}
    </span>
  );
}

export const SEV_COR: Record<SeveridadeAlarme, string> = {
  CRITICO: "text-danger border-danger/30 bg-danger-soft",
  AVISO: "text-warn border-warn/30 bg-warn-soft",
  INFO: "text-info border-info/30 bg-info-soft",
};

export function formatarMetrica(m: Pick<MetricaDTO, "valor" | "casas" | "unidade">) {
  if (m.valor === null) return "—";
  return `${m.valor.toLocaleString("pt-BR", { minimumFractionDigits: m.casas, maximumFractionDigits: m.casas })}`;
}

/** Linha de tendência em SVG (sem biblioteca de gráficos). */
export function Sparkline({ valores, min, max, alerta, className }: {
  valores: (number | null)[]; min: number; max: number; alerta?: boolean; className?: string;
}) {
  const pts = valores.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return <div className={cn("h-10", className)} />;
  const lo = Math.min(min, ...pts.map((p) => p[1]));
  const hi = Math.max(max, ...pts.map((p) => p[1]));
  // usa a faixa observada (com folga) para a linha não ficar achatada
  const obsLo = Math.min(...pts.map((p) => p[1]));
  const obsHi = Math.max(...pts.map((p) => p[1]));
  const folga = Math.max((obsHi - obsLo) * 0.4, (hi - lo) * 0.02, 0.0001);
  const a = obsLo - folga;
  const b = obsHi + folga;
  const n = valores.length - 1;
  const d = pts.map(([i, v], k) => `${k ? "L" : "M"}${((i / n) * 100).toFixed(2)},${(36 - ((v - a) / (b - a)) * 32).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={cn("h-10 w-full", className)} aria-hidden>
      <path d={d} fill="none" stroke={alerta ? "var(--danger)" : "rgba(255,255,255,0.75)"} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Barra da faixa operacional com o marcador do valor atual. */
export function FaixaOperacional({ m }: { m: MetricaDTO }) {
  if (m.valor === null) return <div className="h-1 rounded-full bg-white/[0.06]" />;
  const pos = Math.min(1, Math.max(0, (m.valor - m.min) / (m.max - m.min || 1)));
  return (
    <div className="relative h-1 rounded-full bg-white/[0.08]">
      <div className={cn("absolute inset-y-0 left-0 rounded-full", m.alerta ? "bg-danger" : "bg-white/50")} style={{ width: `${pos * 100}%` }} />
    </div>
  );
}

/** Acumula leituras recebidas por polling para desenhar as tendências. */
export function acumular(serie: Record<string, (number | null)[]>, metricas: MetricaDTO[], limite = 40) {
  const nova = { ...serie };
  for (const m of metricas) nova[m.chave] = [...(nova[m.chave] ?? []), m.valor].slice(-limite);
  return nova;
}

/** "34 min", "26 h 49 min" */
export function formatarDuracao(min: number | null) {
  if (min === null) return "—";
  if (min < 120) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Faixa de advertência com listras zebradas na lateral. */
export function AvisoZebrado({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex overflow-hidden rounded-xl border border-signal/25 bg-signal/[0.04]", className)}>
      <div className="hazard w-1.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
