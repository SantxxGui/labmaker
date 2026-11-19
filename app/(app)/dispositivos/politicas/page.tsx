import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PoliticaModel } from "@/models/dispositivo.model";
import { PoliticasView } from "@/views/dispositivos/politicas-view";

export const metadata: Metadata = { title: "Políticas de dispositivos" };

export default async function PoliticasPage() {
  const session = await requirePageSession("dispositivo:ver");
  return <PoliticasView inicial={await PoliticaModel.listar()} podeEditar={can(session.role, "dispositivo:politicas")} />;
}
