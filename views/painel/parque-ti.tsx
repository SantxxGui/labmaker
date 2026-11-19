import Link from "next/link";
import { ArrowRight, Laptop, Lock, Monitor, ShieldAlert, Smartphone, Tablet } from "lucide-react";
import type { DispositivoPainelDTO, LoteAlertaDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Faixa "Notebooks do espaço" no painel: dispositivos online, conformidade e último alerta enviado. */
export function ParqueTI({ dispositivos, lotes }: { dispositivos: DispositivoPainelDTO[]; lotes: LoteAlertaDTO[] }) {
  const online = dispositivos.filter((d) => d.leitura.online).length;
  const risco = dispositivos.filter((d) => !d.conformidade.conforme).length;
  const bloqueados = dispositivos.filter((d) => d.bloqueado).length;
  const tipos = [
    [Laptop, dispositivos.filter((d) => d.tipo === "NOTEBOOK").length],
    [Monitor, dispositivos.filter((d) => d.tipo === "DESKTOP").length],
    [Tablet, dispositivos.filter((d) => d.tipo === "TABLET").length],
    [Smartphone, dispositivos.filter((d) => d.tipo === "SMARTPHONE").length],
  ] as const;
  const ultimo = lotes[0];

  return (
    <Link href="/dispositivos" className="glass group grid gap-5 rounded-2xl border border-line p-5 transition-colors hover:border-white/20 md:grid-cols-[1fr_auto_1.2fr] md:items-center">
      <div>
        <p className="eyebrow flex items-center gap-2"><span className="ao-vivo size-1.5 rounded-full bg-ok text-ok" />Notebooks e computadores · agora</p>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{online}</span>
          <span className="text-sm text-muted">de {dispositivos.length} dispositivos online</span>
        </p>
        <div className="mt-3 flex gap-4 text-xs text-muted">
          {tipos.map(([I, n], k) => <span key={k} className="flex items-center gap-1"><I className="size-3.5" />{n}</span>)}
        </div>
      </div>
      <div className="flex gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px]", risco ? "border-warn/30 bg-warn-soft text-warn" : "border-ok/25 text-ok")}>
          <ShieldAlert className="size-3.5" />{risco} fora da política
        </span>
        {bloqueados > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-signal/30 bg-signal/10 px-3 py-1 text-[12.5px] text-signal"><Lock className="size-3.5" />{bloqueados}</span>
        )}
      </div>
      <div className="min-w-0 md:border-l md:border-line md:pl-5">
        {ultimo ? (
          <>
            <p className="text-[11px] uppercase tracking-[0.12em] text-subtle">Último alerta enviado</p>
            <p className="mt-1 truncate text-[13.5px] font-medium">{ultimo.titulo}</p>
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div className="h-full bg-ok" style={{ width: `${(ultimo.lidos / ultimo.total) * 100}%` }} />
              <div className="h-full bg-info/70" style={{ width: `${(ultimo.entregues / ultimo.total) * 100}%` }} />
            </div>
            <p className="mt-1.5 flex items-center justify-between text-[11.5px] text-muted">
              <span>{ultimo.lidos} de {ultimo.total} confirmaram leitura</span>
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </p>
          </>
        ) : <p className="text-sm text-muted">Nenhum alerta enviado nos últimos 30 dias.</p>}
      </div>
    </Link>
  );
}
