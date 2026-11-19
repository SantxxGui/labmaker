import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { IndustrialBackdrop } from "@/components/industrial/industrial-backdrop";
import { Logo } from "@/components/logo";

/** Layout das telas de autenticação: cartão de vidro centralizado sobre a linha de produção animada. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_70%_70%_at_50%_45%,#000_30%,transparent_100%)]" />
        <IndustrialBackdrop intensidade={0.55} className="[mask-image:linear-gradient(to_top,#000_15%,transparent_85%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_45%_at_50%_45%,rgba(5,5,6,0.9),transparent)]" />
      </div>

      <header className="relative flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" aria-label="LabMaker — início"><Logo /></Link>
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-subtle transition-colors hover:text-fg">
          <ArrowLeft className="size-3.5" />Voltar ao site
        </Link>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-5 pb-16 pt-4">
        <div className="glass rise w-full max-w-[420px] rounded-3xl border border-line-strong p-7 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] sm:p-9">
          {children}
        </div>
      </main>

      <footer className="relative pb-6 text-center font-mono text-[11px] text-subtle">
        LabMaker · gestão do espaço maker
      </footer>
    </div>
  );
}
