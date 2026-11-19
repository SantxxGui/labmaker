import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { LaboratorioModel } from "@/models/laboratorio.model";
import { LaboratoriosView } from "@/views/laboratorios/laboratorios-view";

export const metadata: Metadata = { title: "Laboratórios" };

export default async function LaboratoriosPage() {
  const session = await requirePageSession("equipamento:ver");
  const [labs, unidades] = await Promise.all([LaboratorioModel.listar(), LaboratorioModel.listarUnidades()]);
  return <LaboratoriosView labs={labs} unidades={unidades} podeCriar={can(session.role, "laboratorio:gerenciar")} />;
}
