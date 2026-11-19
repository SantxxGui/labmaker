import type { Metadata, Viewport } from "next";
import { AgenteWeb } from "@/views/agente/agente-web";

export const metadata: Metadata = {
  title: "Agente LabMaker",
  robots: { index: false },
  // PWA: "Adicionar à tela inicial" abre direto no agente, em tela cheia
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icones/icone-192.png", apple: "/icones/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "LabMaker", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#09090b" };

/** /agente — página pública que transforma um navegador (celular, tablet) em agente do LabMaker. */
export default async function AgentePage({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const { codigo = "" } = await searchParams;
  return <AgenteWeb codigoInicial={codigo} />;
}
