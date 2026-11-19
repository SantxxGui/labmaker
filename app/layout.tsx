import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LabMaker — Gestão do espaço maker", template: "%s · LabMaker" },
  description:
    "Espaço maker conectado: reservas, impressoras 3D, cortadoras a laser, plotters e notebooks monitorados em tempo real.",
};

export const viewport: Viewport = {
  themeColor: "#050506",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster
          position="bottom-right"
          style={{
            "--normal-bg": "var(--surface)",
            "--normal-text": "var(--fg)",
            "--normal-border": "var(--line)",
            "--border-radius": "8px",
          } as React.CSSProperties}
          toastOptions={{ classNames: { description: "!text-muted", toast: "!font-sans !shadow-pop" } }}
        />
      </body>
    </html>
  );
}
