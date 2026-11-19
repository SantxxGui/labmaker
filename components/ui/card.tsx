import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("glass rounded-2xl border border-line", className)} {...props} />;
}

/** Cabeçalho de card: título, descrição e ações à direita. */
export function CardHeader({ title, description, actions, className }: {
  title: React.ReactNode; description?: string; actions?: React.ReactNode; className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow: string; title: string; description?: string; actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.035em] text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, text, className }: { icon?: React.ReactNode; title: string; text?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-5 py-14 text-center", className)}>
      {icon && <span className="mb-1 grid size-10 place-items-center rounded-full border border-line bg-white/[0.03] text-muted [&_svg]:size-4">{icon}</span>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
    </div>
  );
}

/** Controle segmentado (filtros). */
export function Segmented<T extends string>({ value, onChange, options, className }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; className?: string;
}) {
  return (
    <div className={cn("flex gap-0.5 overflow-x-auto rounded-lg border border-line bg-black/40 p-0.5 no-scrollbar", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-[5px] px-2.5 text-[12px] font-medium transition-colors",
            value === o.value ? "bg-white/[0.09] text-fg" : "text-subtle hover:text-fg",
          )}
        >
          {o.label}
          {o.count !== undefined && o.count > 0 && <span className="font-mono text-[10px] text-subtle">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Campo de busca compacto para cabeçalhos de tabela. */
export function SearchInput({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder: string; className?: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn("h-8 w-full rounded-lg border border-line-strong bg-black/40 px-3 text-[13px] text-fg placeholder:text-subtle focus:border-white/40 focus:outline-none focus:ring-[3px] focus:ring-white/[0.07] sm:w-56", className)}
    />
  );
}

/** Estilos de tabela compartilhados. */
export const th = "px-5 py-2.5 text-left font-mono text-[10.5px] font-normal uppercase tracking-[0.1em] text-subtle";
export const td = "px-5 py-3 align-middle";
export const tr = "border-t border-line transition-colors hover:bg-white/[0.02]";
