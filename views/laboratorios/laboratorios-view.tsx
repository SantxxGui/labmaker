import Link from "next/link";
import { MapPin } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import type { LaboratorioDTO } from "@/lib/types";
import { NovoLaboratorioDialog } from "@/views/laboratorios/novo-laboratorio-dialog";

type Unidade = { id: string; nome: string; sigla: string; cidade: string; uf: string };

export function LaboratoriosView({ labs, unidades, podeCriar }: { labs: LaboratorioDTO[]; unidades: Unidade[]; podeCriar: boolean }) {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Ativos"
        title="Unidades e laboratórios"
        description="Estrutura organizacional: cada unidade agrupa laboratórios, e cada laboratório agrupa equipamentos."
        actions={podeCriar ? <NovoLaboratorioDialog unidades={unidades} /> : undefined}
      />
      {unidades.map((u) => {
        const doSite = labs.filter((l) => l.unidade.id === u.id);
        return (
          <section key={u.id}>
            <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-line pb-3">
              <h2 className="flex items-baseline gap-3 text-[17px] font-semibold tracking-tight">
                <span className="rounded-[5px] bg-fg px-1.5 py-0.5 font-mono text-[11px] font-medium text-bg">{u.sigla}</span>
                {u.nome}
              </h2>
              <p className="flex items-center gap-1.5 text-[13px] text-muted">
                <MapPin className="size-3.5" />
                {u.cidade}/{u.uf}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {doSite.map((l) => (
                <Card key={l.id} className="flex flex-col p-5">
                  <p className="font-mono text-[11px] text-accent-text">{l.codigo}</p>
                  <h3 className="mt-1.5 text-[15px] font-semibold tracking-tight">{l.nome}</h3>
                  <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted">{l.descricao ?? "—"}</p>
                  <div className="mt-5 flex items-end justify-between border-t border-line pt-4">
                    <p>
                      <span className="text-2xl font-semibold tracking-tight tabular-nums">{l.totalEquipamentos}</span>
                      <span className="ml-1.5 text-xs text-subtle">equipamentos</span>
                    </p>
                    <Link href="/equipamentos" className="text-[13px] text-muted underline-offset-4 hover:text-fg hover:underline">Ver inventário</Link>
                  </div>
                </Card>
              ))}
              {doSite.length === 0 && <p className="text-sm text-muted">{podeCriar ? "Nenhuma área ainda. Use “Novo laboratório” para criar a primeira (ex.: IMP-01 · Impressão 3D)." : "Nenhuma área cadastrada ainda."}</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
