import { cn } from "@/lib/utils";

/** Marca LabMaker: cubo isométrico (ativo físico) com ponto de sinalização. */
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative grid size-7 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/[0.06]">
        <svg viewBox="0 0 24 24" className="size-4 text-white" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
          <path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4L12 2.8Z" strokeLinejoin="round" />
          <path d="M4 7.4 12 12l8-4.6M12 12v9.2" strokeLinejoin="round" opacity={0.55} />
        </svg>
        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-bg bg-signal" />
      </span>
      {withText && (
        <span className="text-[16px] font-semibold tracking-[-0.03em] text-fg">
          LabMaker
        </span>
      )}
    </span>
  );
}
