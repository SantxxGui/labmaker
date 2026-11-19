import { cn } from "@/lib/utils";

/** Cores chapadas, escolhidas de forma determinística pelo nome. */
const PALETAS = ["bg-info-soft text-info", "bg-ok-soft text-ok", "bg-warn-soft text-warn", "bg-accent-soft text-accent-text", "bg-danger-soft text-danger"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function iniciais(nome: string) {
  const p = nome.split(" ").filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ nome, className }: { nome: string; className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold", PALETAS[hash(nome) % PALETAS.length], className)}>
      {iniciais(nome)}
    </span>
  );
}
