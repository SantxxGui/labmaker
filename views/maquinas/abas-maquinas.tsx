import Link from "next/link";
import { cn } from "@/lib/utils";

/** Alterna entre a operação em tempo real e o cadastro (inventário). */
export function AbasMaquinas({ atual }: { atual: "monitoramento" | "inventario" }) {
  const abas = [
    { id: "monitoramento", href: "/equipamentos", label: "Monitoramento" },
    { id: "inventario", href: "/equipamentos/inventario", label: "Inventário e cadastro" },
  ] as const;
  return (
    <nav className="glass inline-flex rounded-xl border border-line p-1">
      {abas.map((a) => (
        <Link
          key={a.id}
          href={a.href}
          aria-current={a.id === atual ? "page" : undefined}
          className={cn("rounded-lg px-3.5 py-1.5 text-[13px] transition-colors", a.id === atual ? "bg-white/[0.09] text-fg" : "text-subtle hover:text-fg")}
        >
          {a.label}
        </Link>
      ))}
    </nav>
  );
}
