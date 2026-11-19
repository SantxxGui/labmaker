import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="text-center">
        <Logo />
        <p className="eyebrow mt-10">Erro 404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Página não encontrada</h1>
        <p className="mt-2 text-muted">O endereço não existe ou foi movido.</p>
        <Button asChild className="mt-7"><Link href="/">Voltar ao início</Link></Button>
      </div>
    </div>
  );
}
