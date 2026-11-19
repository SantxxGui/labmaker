import { cn } from "@/lib/utils";
import { CALIBRACAO_LABEL, STATUS_LABEL } from "@/lib/labels";
import type { SituacaoCalibracao, StatusEquipamento } from "@/lib/types";

export type Tone = "ok" | "info" | "warn" | "danger" | "neutral" | "accent";

const TONES: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok border border-ok/20",
  info: "bg-info-soft text-info border border-info/20",
  warn: "bg-warn-soft text-warn border border-warn/20",
  danger: "bg-danger-soft text-danger border border-danger/20",
  accent: "bg-warn-soft text-accent-text border border-warn/20",
  neutral: "bg-white/[0.04] text-muted border border-line",
};
const DOTS: Record<Tone, string> = {
  ok: "bg-ok", info: "bg-info", warn: "bg-warn", danger: "bg-danger", accent: "bg-signal", neutral: "bg-subtle",
};

export function Badge({ tone = "neutral", dot, className, children }: {
  tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium", TONES[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", DOTS[tone])} />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<StatusEquipamento, Tone> = { LIVRE: "ok", EM_USO: "info", MANUTENCAO: "danger" };

export function StatusBadge({ status, className }: { status: StatusEquipamento; className?: string }) {
  return <Badge tone={STATUS_TONE[status]} dot className={className}>{STATUS_LABEL[status]}</Badge>;
}

const CAL_TONE: Record<SituacaoCalibracao, Tone> = {
  NAO_APLICAVEL: "neutral", EM_DIA: "ok", A_VENCER: "warn", VENCIDA: "danger", PENDENTE: "danger",
};

export function CalibracaoBadge({ situacao, className }: { situacao: SituacaoCalibracao; className?: string }) {
  return <Badge tone={CAL_TONE[situacao]} className={className}>{CALIBRACAO_LABEL[situacao]}</Badge>;
}
