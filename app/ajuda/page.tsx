import type { Metadata, Viewport } from "next";
import { JanelaAjuda } from "@/views/agente/janela-ajuda";

export const metadata: Metadata = {
  title: "LabMaker · Ajuda",
  robots: { index: false },
  icons: { icon: "/icones/icone-192.png" },
};
export const viewport: Viewport = { themeColor: "#09090b" };

/** /ajuda — janelinha de chat do "Pedir ajuda ao Líder" nos computadores (aberta pelo agente). */
export default function AjudaPage() {
  return <JanelaAjuda />;
}
