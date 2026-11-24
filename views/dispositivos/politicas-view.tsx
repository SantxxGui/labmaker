"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Ban, Check, Download, FileDown, HardDrive, KeyRound, Save, Timer, Usb, X, Moon } from "lucide-react";
import { Surgir } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CATEGORIAS_SITE, downloadPermitido } from "@/lib/agente";
import { MODO_DOWNLOAD_LABEL } from "@/lib/labels";
import type { ModoDownload, PoliticaDTO } from "@/lib/types";
import { cn, tempoRelativo } from "@/lib/utils";

const MODOS: { valor: ModoDownload; texto: string }[] = [
  { valor: "LIVRE", texto: "Qualquer arquivo" },
  { valor: "BLOQUEAR_EXECUTAVEIS", texto: ".exe, .msi, .dmg, .apk… barrados" },
  { valor: "SOMENTE_APROVADOS", texto: "Instalação só pelo catálogo" },
];

export function PoliticasView({ inicial, podeEditar }: { inicial: PoliticaDTO[]; podeEditar: boolean }) {
  const [politicas, setPoliticas] = useState(inicial);
  const [arquivo, setArquivo] = useState("MinecraftInstaller.exe");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dispositivos" className="inline-flex items-center gap-1.5 text-[13px] text-subtle transition-colors hover:text-fg">
          <ArrowLeft className="size-3.5" /> Central de dispositivos
        </Link>
        <div className="mt-4">
          <PageHeader
            eyebrow="Espaço maker · regras dos computadores"
            title="Políticas dos notebooks"
            description="O que cada grupo de dispositivos pode fazer: pendrive, downloads, sites e aplicativos. O agente aplica as mudanças no próximo check-in (em até 30 s)."
          />
        </div>
      </div>

      {/* Testador de download */}
      <Surgir>
        <Card className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="lg:w-[340px]">
              <p className="eyebrow flex items-center gap-2"><FileDown className="size-3.5" />Teste um download</p>
              <p className="mt-1.5 text-[13px] text-muted">Digite um nome de arquivo e veja, ao vivo, o que cada política faria.</p>
              <Input value={arquivo} onChange={(e) => setArquivo(e.target.value)} className="mt-3 font-mono" placeholder="relatorio.pdf, setup.exe…" />
            </div>
            <div className="grid flex-1 gap-2 sm:grid-cols-2">
              {politicas.map((p) => {
                const r = downloadPermitido(arquivo || "arquivo", p.modoDownload);
                return (
                  <motion.div key={p.id} layout className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors", r.ok ? "border-ok/25 bg-ok-soft/40" : "border-danger/30 bg-danger-soft/40")}>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span key={String(r.ok)} initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", bounce: 0.5, duration: 0.4 }}
                        className={cn("grid size-7 shrink-0 place-items-center rounded-full", r.ok ? "bg-ok text-black" : "bg-danger text-white")}>
                        {r.ok ? <Check className="size-4" strokeWidth={3} /> : <X className="size-4" strokeWidth={3} />}
                      </motion.span>
                    </AnimatePresence>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium">{p.nome}</p>
                      <p className={cn("truncate text-[11.5px]", r.ok ? "text-ok" : "text-danger")}>{r.ok ? "Download permitido" : `Bloqueado: ${r.motivo}`}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </Card>
      </Surgir>

      <div className="grid gap-4 lg:grid-cols-2">
        {politicas.map((p, i) => (
          <Surgir key={p.id} i={i + 1}>
            <CartaoPolitica politica={p} podeEditar={podeEditar} onSalva={(n) => setPoliticas((l) => l.map((x) => (x.id === n.id ? n : x)))} />
          </Surgir>
        ))}
      </div>
    </div>
  );
}

function CartaoPolitica({ politica, podeEditar, onSalva }: { politica: PoliticaDTO; podeEditar: boolean; onSalva: (p: PoliticaDTO) => void }) {
  const [f, setF] = useState(politica);
  const [novoApp, setNovoApp] = useState("");
  const [salvando, setSalvando] = useState(false);
  const sujo = JSON.stringify([f.bloquearUsb, f.modoDownload, f.sitesBloqueados, f.appsBloqueados, f.exigirCriptografia, f.bloqueioTelaMinutos, f.bloquearForaHorario])
    !== JSON.stringify([politica.bloquearUsb, politica.modoDownload, politica.sitesBloqueados, politica.appsBloqueados, politica.exigirCriptografia, politica.bloqueioTelaMinutos, politica.bloquearForaHorario]);

  const set = <K extends keyof PoliticaDTO>(k: K, v: PoliticaDTO[K]) => setF((x) => ({ ...x, [k]: v }));
  const alternarSite = (s: string) => set("sitesBloqueados", f.sitesBloqueados.includes(s) ? f.sitesBloqueados.filter((x) => x !== s) : [...f.sitesBloqueados, s]);

  async function salvar() {
    setSalvando(true);
    try {
      const r = await fetch(`/api/politicas/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bloquearUsb: f.bloquearUsb, modoDownload: f.modoDownload, sitesBloqueados: f.sitesBloqueados, appsBloqueados: f.appsBloqueados,
          exigirCriptografia: f.exigirCriptografia, bloqueioTelaMinutos: f.bloqueioTelaMinutos, bloquearForaHorario: f.bloquearForaHorario,
        }),
      });
      const j = await r.json();
      if (!r.ok) return toast.error(j.error ?? "Não foi possível salvar.");
      onSalva(j.politica);
      setF(j.politica);
      toast.success("Política salva", { description: `${j.politica.totalDispositivos} dispositivo(s) recebem a mudança no próximo check-in.` });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className={cn("flex h-full flex-col p-0 transition-colors", sujo && "border-signal/40")}>
      <div className="flex items-start justify-between gap-3 border-b border-line p-5">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-tight">{f.nome}</h2>
          <p className="mt-1 text-[13px] leading-snug text-muted">{f.descricao}</p>
        </div>
        <span className="shrink-0 rounded-full border border-line px-2.5 py-0.5 font-mono text-[11px] text-muted">{f.totalDispositivos} disp.</span>
      </div>

      <div className="flex-1 space-y-5 p-5">
        <div className="grid gap-2 sm:grid-cols-2">
          <Linha icone={Usb} rotulo="Bloquear pendrive (USB)">
            <Switch checked={f.bloquearUsb} disabled={!podeEditar} onCheckedChange={(v) => set("bloquearUsb", v)} aria-label="Bloquear USB" />
          </Linha>
          <Linha icone={KeyRound} rotulo="Exigir criptografia do disco">
            <Switch checked={f.exigirCriptografia} disabled={!podeEditar} onCheckedChange={(v) => set("exigirCriptografia", v)} aria-label="Exigir criptografia" />
          </Linha>
          <Linha icone={Timer} rotulo="Bloqueio de tela (min)">
            <Input type="number" min={1} max={120} disabled={!podeEditar} value={f.bloqueioTelaMinutos} onChange={(e) => set("bloqueioTelaMinutos", Number(e.target.value))} className="h-8 w-16 text-center font-mono" />
          </Linha>
          <Linha icone={Moon} rotulo="Travar fora do horário (20h–8h, domingo)">
            <Switch checked={f.bloquearForaHorario} disabled={!podeEditar} onCheckedChange={(v) => set("bloquearForaHorario", v)} aria-label="Travar fora do horário" />
          </Linha>
          <Linha icone={HardDrive} rotulo="Atualizada">
            <span className="text-[12px] text-subtle">{tempoRelativo(politica.atualizadoEm)}</span>
          </Linha>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-2 text-[13px] font-medium"><Download className="size-3.5 text-subtle" />Downloads</p>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {MODOS.map((m) => (
              <button key={m.valor} type="button" disabled={!podeEditar} onClick={() => set("modoDownload", m.valor)}
                className={cn("relative rounded-xl border p-2.5 text-left transition-colors disabled:cursor-default", f.modoDownload === m.valor ? "border-white/40 bg-white/[0.07]" : "border-line hover:border-white/20")}>
                {f.modoDownload === m.valor && <motion.span layoutId={`modo-${f.id}`} className="absolute inset-0 rounded-xl ring-1 ring-signal/60" />}
                <span className="block text-[12.5px] font-medium">{MODO_DOWNLOAD_LABEL[m.valor]}</span>
                <span className="block text-[11px] leading-snug text-subtle">{m.texto}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-2 text-[13px] font-medium"><Ban className="size-3.5 text-subtle" />Categorias de site bloqueadas</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(CATEGORIAS_SITE).map(([k, rot]) => {
              const on = f.sitesBloqueados.includes(k);
              return (
                <motion.button key={k} type="button" disabled={!podeEditar} onClick={() => alternarSite(k)} whileTap={{ scale: 0.94 }}
                  className={cn("rounded-full border px-2.5 py-1 text-[11.5px] transition-colors disabled:cursor-default", on ? "border-danger/35 bg-danger-soft text-danger" : "border-line text-subtle hover:text-fg")}>
                  {on ? "⊘ " : "+ "}{rot}
                </motion.button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-0.5 text-[13px] font-medium">Aplicativos proibidos</p>
          <p className="mb-2 text-[12px] text-subtle">O agente fecha estes programas assim que abrem e avisa você (computadores instalados com “Aplicar a política”). Também não aparecem para instalar pelo painel.</p>
          <div className="flex flex-wrap gap-1.5">
            <AnimatePresence initial={false}>
              {f.appsBloqueados.map((a) => (
                <motion.span key={a} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-white/[0.04] py-0.5 pl-2.5 pr-1 text-[11.5px]">
                  {a}
                  {podeEditar && (
                    <button type="button" aria-label={`Liberar ${a}`} onClick={() => set("appsBloqueados", f.appsBloqueados.filter((x) => x !== a))} className="grid size-4 place-items-center rounded-full text-subtle hover:bg-white/10 hover:text-fg"><X className="size-3" /></button>
                  )}
                </motion.span>
              ))}
            </AnimatePresence>
            {podeEditar && (
              <form className="inline-flex" onSubmit={(e) => { e.preventDefault(); const v = novoApp.trim(); if (v && !f.appsBloqueados.includes(v)) set("appsBloqueados", [...f.appsBloqueados, v]); setNovoApp(""); }}>
                <input value={novoApp} onChange={(e) => setNovoApp(e.target.value)} placeholder="+ proibir app" aria-label="Proibir aplicativo"
                  className="h-6 w-28 rounded-full border border-dashed border-line bg-transparent px-2.5 text-[11.5px] outline-none placeholder:text-subtle focus:border-white/30" />
              </form>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {podeEditar && sujo && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-t border-signal/30 bg-signal/[0.06] px-5 py-3">
              <span className="text-[12.5px] text-signal">Alterações não salvas</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setF(politica)}>Descartar</Button>
                <Button size="sm" onClick={salvar} loading={salvando}><Save />Salvar política</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!podeEditar && <p className="border-t border-line px-5 py-2.5 text-[11.5px] text-subtle">Somente o Administrador altera políticas.</p>}
    </Card>
  );
}

function Linha({ icone: I, rotulo, children }: { icone: React.ElementType; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white/[0.02] px-3 py-2">
      <span className="flex items-center gap-2 text-[12.5px] text-muted"><I className="size-3.5" />{rotulo}</span>
      {children}
    </div>
  );
}

