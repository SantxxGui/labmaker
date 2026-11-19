import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { AuditoriaModel } from "@/models/auditoria.model";
import { AuditoriaView } from "@/views/auditoria/auditoria-view";

export const metadata: Metadata = { title: "Auditoria" };

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ entidade?: string; busca?: string; pagina?: string }> }) {
  await requirePageSession("auditoria:ver");
  const q = await searchParams;
  const r = await AuditoriaModel.listar({ entidade: q.entidade || undefined, busca: q.busca || undefined, pagina: Number(q.pagina) || 1 });
  return <AuditoriaView r={r} q={q} />;
}
