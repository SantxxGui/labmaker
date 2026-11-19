import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { TvView } from "@/views/tv/tv-view";

export const metadata: Metadata = { title: "Modo TV" };

/** /tv — tela cheia para o monitor da recepção do espaço (sem menu; atualiza sozinha a cada 5 s). */
export default async function TvPage() {
  await requirePageSession("painel:ver");
  return <TvView />;
}
