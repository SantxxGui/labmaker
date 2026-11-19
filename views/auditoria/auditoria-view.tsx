import Link from "next/link";
import { ChevronLeft, ChevronRight, FileDown, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card, EmptyState, PageHeader, td, th, tr } from "@/components/ui/card";
import { ACAO_LABEL } from "@/lib/labels";
import { ROLE_LABEL } from "@/lib/permissions";
import type { AuditoriaDTO } from "@/lib/types";
import { cn, formatData, formatHora } from "@/lib/utils";

export type FiltroAuditoria = { entidade?: string; busca?: string; pagina?: string };
export type PaginaAuditoria = { total: number; pagina: number; paginas: number; registros: AuditoriaDTO[] };

const ENTIDADES = [
  ["", "Tudo"], ["equipamento", "Máquinas"], ["agendamento", "Reservas"], ["dispositivo", "Notebooks"], ["emprestimo", "Empréstimos"], ["usuario", "Usuários"],
] as const;

function tom(acao: string): Tone {
  if (acao.includes("removid") || acao.includes("cancelad")) return "danger";
  if (acao.includes("status") || acao.startsWith("usuario")) return "warn";
  if (acao.startsWith("calibracao") || acao.startsWith("manutencao")) return "accent";
  if (acao.includes("bloqueio")) return "danger";
  if (acao.startsWith("auth") || acao.startsWith("auditoria")) return "neutral";
  return "info";
}

/** Trilha de auditoria — filtros e paginação via query string (sem JavaScript no cliente). */
export function AuditoriaView({ r, q }: { r: PaginaAuditoria; q: FiltroAuditoria }) {
  const url = (p: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ entidade: q.entidade, busca: q.busca, ...p })) if (v) sp.set(k, String(v));
    return `/auditoria${sp.size ? `?${sp}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governança"
        title="Trilha de auditoria"
        description="Registro imutável de quem fez o quê e quando. Um gatilho no PostgreSQL recusa UPDATE e DELETE nesta tabela — nem a aplicação consegue alterar o histórico."
        actions={
          <a
            href={`/api/auditoria/exportar${q.entidade || q.busca ? `?${new URLSearchParams({ ...(q.entidade ? { entidade: q.entidade } : {}), ...(q.busca ? { busca: q.busca } : {}) })}` : ""}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-medium transition-colors hover:bg-raised"
          >
            <FileDown className="size-4" />Exportar CSV
          </a>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-0.5 overflow-x-auto rounded-md border border-line bg-raised p-0.5 no-scrollbar">
            {ENTIDADES.map(([v, label]) => (
              <Link key={v} href={url({ entidade: v || undefined, pagina: undefined })} className={cn("flex h-7 shrink-0 items-center rounded-[5px] px-2.5 text-[12px] font-medium transition-colors", (q.entidade ?? "") === v ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}>
                {label}
              </Link>
            ))}
          </div>
          <form action="/auditoria" className="flex gap-2">
            {q.entidade && <input type="hidden" name="entidade" value={q.entidade} />}
            <input type="search" name="busca" defaultValue={q.busca} placeholder="Buscar por pessoa ou descrição…" className="h-8 w-full rounded-md border border-line-strong bg-surface px-3 text-[13px] placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 lg:w-72" />
            <button className="h-8 shrink-0 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-raised">Buscar</button>
          </form>
        </div>

        {r.registros.length === 0 ? (
          <EmptyState icon={<ShieldCheck />} title="Nenhum registro encontrado" text="Ajuste os filtros para ver outros eventos." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Quando</th>
                  <th className={th}>Quem</th>
                  <th className={th}>Ação</th>
                  <th className={th}>Descrição</th>
                  <th className={th}>Origem</th>
                </tr>
              </thead>
              <tbody>
                {r.registros.map((a) => (
                  <tr key={a.id} className={tr}>
                    <td className={cn(td, "whitespace-nowrap font-mono text-[12px] tabular-nums")}>
                      <span className="text-fg">{formatData(a.criadoEm)}</span> <span className="text-subtle">{formatHora(a.criadoEm)}</span>
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-2.5">
                        <Avatar nome={a.usuarioNome} className="size-7 text-[10px]" />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] text-fg">{a.usuarioNome}</p>
                          <p className="text-[11px] text-subtle">{a.usuarioRole ? ROLE_LABEL[a.usuarioRole] : "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className={td}><Badge tone={tom(a.acao)}>{ACAO_LABEL[a.acao] ?? a.acao}</Badge></td>
                    <td className={cn(td, "text-[13px] text-muted")}>{a.resumo}</td>
                    <td className={cn(td, "font-mono text-[11px] text-subtle")}>{a.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-muted">
          <span>{r.total} {r.total === 1 ? "registro" : "registros"} · página {r.pagina} de {r.paginas}</span>
          <div className="flex gap-1">
            <PageLink href={url({ pagina: r.pagina - 1 })} disabled={r.pagina <= 1} label="Página anterior"><ChevronLeft className="size-4" /></PageLink>
            <PageLink href={url({ pagina: r.pagina + 1 })} disabled={r.pagina >= r.paginas} label="Próxima página"><ChevronRight className="size-4" /></PageLink>
          </div>
        </div>
      </Card>
    </div>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  const cls = "grid size-8 place-items-center rounded-md border border-line-strong bg-surface";
  return disabled ? <span className={cn(cls, "opacity-40")} aria-disabled>{children}</span> : <Link href={href} aria-label={label} className={cn(cls, "hover:bg-raised")}>{children}</Link>;
}
