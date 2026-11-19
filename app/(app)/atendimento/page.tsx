import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { ChamadoModel } from "@/models/chamado.model";
import { AtendimentoView } from "@/views/atendimento/atendimento-view";

export const metadata: Metadata = { title: "Atendimento" };

export default async function AtendimentoPage({ searchParams }: { searchParams: Promise<{ chamado?: string }> }) {
  await requirePageSession("dispositivo:comandar");
  const { chamado } = await searchParams;
  return <AtendimentoView inicial={await ChamadoModel.fila()} selecionadoInicial={chamado ?? null} />;
}
