"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BellRing, LogOut, Stethoscope, Tv } from "lucide-react";
import { IndustrialBackdrop } from "@/components/industrial/industrial-backdrop";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/ui/avatar";
import { ROLE_LABEL, can, type Permissao } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/session";
import type { AlarmeDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; permissao?: Permissao };

const NAV: Item[] = [
  { href: "/painel", label: "Painel", permissao: "painel:ver" },
  { href: "/equipamentos", label: "Máquinas" },
  { href: "/dispositivos", label: "Notebooks", permissao: "dispositivo:ver" },
  { href: "/atendimento", label: "Atendimento", permissao: "dispositivo:comandar" },
  { href: "/reservas", label: "Reservar" },
  { href: "/agenda", label: "Agenda", permissao: "reserva:ver_todas" },
  { href: "/calibracao", label: "Calibração", permissao: "manutencao:ver" },
  { href: "/laboratorios", label: "Laboratórios" },
  { href: "/auditoria", label: "Auditoria", permissao: "auditoria:ver" },
  { href: "/usuarios", label: "Usuários", permissao: "usuario:gerenciar" },
];

/** Selo com o número de pedidos de ajuda esperando — consulta a API a cada 10 s e avisa quando chega um novo. */
function ContadorChamados() {
  const [abertos, setAbertos] = useState(0);
  useEffect(() => {
    let vivo = true, anterior = -1;
    const buscar = () =>
      fetch("/api/chamados/contagem", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!vivo || !d) return;
          if (anterior >= 0 && d.abertos > anterior) {
            import("sonner").then(({ toast }) => toast("Novo pedido de ajuda", { description: "Um aluno está pedindo ajuda.", action: { label: "Ver", onClick: () => { location.href = "/atendimento"; } } }));
          }
          anterior = d.abertos;
          setAbertos(d.abertos);
        })
        .catch(() => {});
    buscar();
    const id = setInterval(buscar, 10_000);
    return () => { vivo = false; clearInterval(id); };
  }, []);
  if (!abertos) return null;
  return <span className="ml-1.5 inline-grid min-w-4 place-items-center rounded-full bg-signal px-1 text-[10px] font-semibold leading-4 text-zinc-950 tabular-nums">{abertos}</span>;
}

/** Indicador de alarmes ativos no topo — consulta a API a cada 15 s. */
function AlarmesAtivos() {
  const [alarmes, setAlarmes] = useState<AlarmeDTO[] | null>(null);
  useEffect(() => {
    let vivo = true;
    const buscar = () =>
      fetch("/api/alarmes")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => vivo && d && setAlarmes(d.alarmes))
        .catch(() => {});
    buscar();
    const id = setInterval(buscar, 15_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);
  if (!alarmes) return null;
  const criticos = alarmes.filter((a) => a.severidade === "CRITICO").length;
  return (
    <Link
      href="/equipamentos"
      title={alarmes.map((a) => `${a.codigo} · ${a.equipamento.nome}`).join("\n") || "Nenhum alarme ativo"}
      className={cn(
        "flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors",
        criticos ? "alarm-ring border-danger/40 bg-danger-soft text-danger" : alarmes.length ? "border-warn/30 bg-warn-soft text-warn" : "border-line text-subtle hover:text-fg",
      )}
    >
      <BellRing className="size-3.5" />
      <span className="tabular-nums">{alarmes.length}</span>
      <span className="hidden xl:inline">{alarmes.length === 1 ? "alarme" : "alarmes"}</span>
    </Link>
  );
}

export function AppShell({ session, children }: { session: SessionPayload; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  const reduzir = useReducedMotion();
  const itens = NAV.filter((i) => !i.permissao || can(session.role, i.permissao));
  const ativo = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  async function sair() {
    setSaindo(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative min-h-dvh">
      {/* Fundo: grade técnica + linha de produção animada, bem discreta */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,#000_20%,transparent_100%)]" />
        <div className="flutuar absolute -top-40 right-[-10%] size-[620px] rounded-full bg-signal/[0.07] blur-[120px]" />
        <div className="absolute -left-40 top-1/3 size-[520px] rounded-full bg-sky-500/[0.04] blur-[120px]" />
        <IndustrialBackdrop intensidade={0.28} className="[mask-image:linear-gradient(to_top,#000_10%,transparent_75%)]" />
      </div>

      <header className="glass sticky top-0 z-40 border-b border-line">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-5 px-4 sm:px-6">
          <Link href={itens[0]?.href ?? "/"} className="shrink-0" aria-label="LabMaker — início">
            <Logo />
          </Link>
          <span className="hidden h-5 w-px bg-white/10 md:block" />
          <nav className="hidden min-w-0 items-center gap-0.5 overflow-x-auto no-scrollbar md:flex">
            {itens.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={ativo(i.href) ? "page" : undefined}
                className={cn("relative shrink-0 rounded-md px-3 py-1.5 text-[13.5px] transition-colors", ativo(i.href) ? "text-fg" : "text-subtle hover:text-fg")}
              >
                {ativo(i.href) && (
                  <motion.span layoutId="nav-ativo" transition={{ type: "spring", bounce: 0.15, duration: 0.45 }} className="absolute inset-0 rounded-md bg-white/[0.08]" />
                )}
                <span className="relative">{i.label}{i.href === "/atendimento" && <ContadorChamados />}</span>
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-3">
            {can(session.role, "maquina:monitorar") && <AlarmesAtivos />}
            {can(session.role, "painel:ver") && (
              <Link href="/tv" title="Modo TV · tela da recepção" aria-label="Modo TV" className="grid size-8 place-items-center rounded-md text-subtle transition-colors hover:bg-white/[0.06] hover:text-fg">
                <Tv className="size-4" />
              </Link>
            )}
            {can(session.role, "dispositivo:cadastrar") && (
              <Link href="/diagnostico" title="Diagnóstico · pré-apresentação" aria-label="Diagnóstico" className={cn("grid size-8 place-items-center rounded-md transition-colors hover:bg-white/[0.06] hover:text-fg", ativo("/diagnostico") ? "text-fg" : "text-subtle")}>
                <Stethoscope className="size-4" />
              </Link>
            )}
            <span title={ROLE_LABEL[session.role]} className="hidden rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-subtle xl:inline">
              {ROLE_LABEL[session.role].split(" (")[0]}
            </span>
            <div className="flex items-center gap-2.5">
              <Avatar nome={session.nome} className="size-7 text-[10px]" />
              <span className="hidden text-sm text-muted 2xl:inline">{session.nome}</span>
            </div>
            <button
              onClick={sair}
              disabled={saindo}
              aria-label="Sair"
              title="Sair"
              className="grid size-8 place-items-center rounded-md text-subtle transition-colors hover:bg-white/[0.06] hover:text-fg disabled:opacity-50"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
        {/* navegação no celular */}
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 no-scrollbar md:hidden">
          {itens.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cn("h-8 shrink-0 rounded-md px-3 text-[13px] leading-8", ativo(i.href) ? "bg-white/[0.08] text-fg" : "text-subtle")}
            >
              {i.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-8 sm:px-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={reduzir ? false : { opacity: 0, y: 12, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduzir ? undefined : { opacity: 0, y: -6, transition: { duration: 0.12 } }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
