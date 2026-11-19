import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { AlarmeDTO, TelemetriaDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Faixa "máquinas do espaço" no painel: estado da frota no momento do carregamento. */
export function ChaoDeFabrica({ leituras, alarmes }: { leituras: TelemetriaDTO[]; alarmes: AlarmeDTO[] }) {
  const conta = (f: (l: TelemetriaDTO) => boolean) => leituras.filter(f).length;
  const estados = [
    { rotulo: "Operando", n: conta((l) => l.estado === "OPERANDO"), cor: "bg-ok" },
    { rotulo: "Pausadas", n: conta((l) => l.estado === "PAUSADO"), cor: "bg-warn" },
    { rotulo: "Ociosas", n: conta((l) => l.estado === "OCIOSO"), cor: "bg-white/30" },
    { rotulo: "Alarme / manutenção", n: conta((l) => l.estado === "ALARME" || l.estado === "MANUTENCAO"), cor: "bg-danger" },
    { rotulo: "Offline", n: conta((l) => l.estado === "OFFLINE"), cor: "bg-zinc-700" },
  ];
  const oees = leituras.map((l) => l.oee).filter((v): v is number => v !== null);
  const oee = oees.length ? Math.round((oees.reduce((a, b) => a + b, 0) / oees.length) * 100) : 0;
  const criticos = alarmes.filter((a) => a.severidade === "CRITICO");

  return (
    <Link href="/equipamentos" className="glass group block rounded-2xl border border-line p-5 transition-colors hover:border-white/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow flex items-center gap-2"><span className="size-1.5 rounded-full bg-ok led-pulse" />Máquinas do espaço · agora</p>
        <span className="inline-flex items-center gap-1 text-[13px] text-muted transition-colors group-hover:text-fg">Central de máquinas <ArrowRight className="size-3.5" /></span>
      </div>
      <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
        {estados.map((e) => e.n > 0 && <div key={e.rotulo} className={cn("h-full border-r border-bg last:border-r-0", e.cor)} style={{ width: `${(e.n / Math.max(1, leituras.length)) * 100}%` }} />)}
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
          {estados.map((e) => (
            <li key={e.rotulo} className="flex items-center gap-2 text-muted">
              <span className={cn("size-2 rounded-full", e.cor)} />
              {e.rotulo} <span className="font-mono text-fg tabular-nums">{e.n}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-6">
          <p className="text-[13px] text-muted">OEE médio <span className="ml-1 font-mono text-[18px] text-fg">{oee}%</span></p>
          {criticos.length > 0 ? (
            <span className="alarm-ring inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger-soft px-3 py-1 text-[12.5px] font-medium text-danger">
              <AlertTriangle className="size-3.5" />{criticos.length} alarme{criticos.length > 1 ? "s" : ""} crítico{criticos.length > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-[12.5px] text-muted">{alarmes.length} alarme(s) ativo(s)</span>
          )}
        </div>
      </div>
    </Link>
  );
}
