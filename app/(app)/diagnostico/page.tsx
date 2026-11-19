import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { DiagnosticoView } from "@/views/sistema/diagnostico-view";

export const metadata: Metadata = { title: "Diagnóstico" };

export default async function DiagnosticoPage() {
  await requirePageSession("dispositivo:cadastrar");
  return <DiagnosticoView />;
}
