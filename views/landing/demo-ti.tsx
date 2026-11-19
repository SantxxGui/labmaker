"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, FileDown, Laptop, Monitor, RotateCcw, Send, Smartphone, Tablet, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { downloadPermitido } from "@/lib/agente";
import type { ModoDownload, SeveridadeAlarme } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CartaoNotificacao, PRIORIDADE } from "@/views/dispositivos/dispositivo-ui";

const APARELHOS = [
  { id: "nb", nome: "LM-NB-01", icone: Laptop, estilo: "windows" as const, forma: "aspect-[16/10] rounded-t-lg" },
  { id: "mac", nome: "LM-NB-PROF", icone: Laptop, estilo: "macos" as const, forma: "aspect-[16/10] rounded-t-lg" },
  { id: "tb", nome: "LM-TB-BALCAO", icone: Tablet, estilo: "mobile" as const, forma: "aspect-[4/3] rounded-[14px] border-[5px] border-zinc-800" },
  { id: "sp", nome: "Celular do Líder", icone: Smartphone, estilo: "mobile" as const, forma: "aspect-[9/16] rounded-[20px] border-[5px] border-zinc-800 max-w-[118px] mx-auto" },
];

/** Demonstração da landing: o visitante dispara um alerta e vê chegar em cada aparelho. */
export function DemoAlerta() {
  const [prioridade, setPrioridade] = useState<SeveridadeAlarme>("CRITICO");
  const [fase, setFase] = useState<"pronto" | "enviando" | "entregue">("pronto");
  const [chegou, setChegou] = useState<string[]>([]);
  const [lidos, setLidos] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function disparar() {
    timers.current.forEach(clearTimeout);
    setChegou([]);
    setLidos(0);
    setFase("enviando");
    APARELHOS.forEach((a, k) => timers.current.push(setTimeout(() => setChegou((c) => [...c, a.id]), 450 + k * 380)));
    timers.current.push(setTimeout(() => setFase("entregue"), 450 + APARELHOS.length * 380));
    [2200, 3100, 4300].forEach((ms, k) => timers.current.push(setTimeout(() => setLidos(k + 1), ms)));
  }

  const n = {
    titulo: prioridade === "CRITICO" ? "Golpe de phishing em circulação" : prioridade === "AVISO" ? "O espaço fecha em 15 minutos" : "Sua impressão terminou",
    mensagem: prioridade === "CRITICO" ? "Não abra e-mails \"Bolsa aprovada\". Dúvidas: fale com o Líder do espaço." : prioridade === "AVISO" ? "Salve seus arquivos e devolva o notebook no balcão." : "A peça da Bambu X1C está pronta na prateleira 3.",
    prioridade,
  };

  return (
    <div className="glass rounded-2xl border border-line-strong p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(PRIORIDADE) as SeveridadeAlarme[]).map((p) => (
            <button key={p} onClick={() => { setPrioridade(p); setFase("pronto"); setChegou([]); setLidos(0); }}
              className={cn("rounded-full border px-3 py-1 text-[12.5px] transition-colors", prioridade === p ? PRIORIDADE[p].classe : "border-line text-subtle hover:text-fg")}>
              {PRIORIDADE[p].rotulo}
            </button>
          ))}
        </div>
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={disparar} disabled={fase === "enviando"}
          className={cn("reflexo inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium disabled:opacity-60", prioridade === "CRITICO" ? "bg-danger text-white" : "bg-white text-black")}>
          {fase === "entregue" ? <RotateCcw className="size-4" /> : <Send className="size-4" />}
          {fase === "pronto" ? "Enviar para 4 aparelhos" : fase === "enviando" ? "Enviando…" : "Enviar de novo"}
        </motion.button>
      </div>

      <div className="mt-6 grid grid-cols-2 items-end gap-4 md:grid-cols-4">
        {APARELHOS.map((a) => {
          const ok = chegou.includes(a.id);
          return (
            <div key={a.id} className="min-w-0">
              <div className={cn("relative overflow-hidden border border-white/10 bg-[#0b0c0e]", a.forma)}>
                <div className="absolute inset-0 bg-grid opacity-70" />
                <AnimatePresence>
                  {ok && (
                    <motion.div initial={{ opacity: 0, y: a.estilo === "mobile" ? -24 : 16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
                      transition={{ type: "spring", bounce: 0.35, duration: 0.6 }}
                      className={cn("absolute", a.estilo === "mobile" ? "inset-x-[-18%] top-1 origin-top scale-[0.66]" : "left-[5%] top-[6%] w-[170%] origin-top-left scale-[0.53]")}>
                      <CartaoNotificacao n={n} estilo={a.estilo} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {a.icone === Laptop && <div className="mx-[-6%] h-1.5 rounded-b-md bg-zinc-700" />}
              <p className="mt-2.5 flex items-center justify-center gap-1.5 font-mono text-[10.5px] text-subtle">
                <span className={cn("size-1.5 rounded-full transition-colors", ok ? "bg-ok" : "bg-zinc-600")} />{a.nome}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        {[["Enviados", fase === "pronto" ? 0 : 4, "text-fg"], ["Entregues", chegou.length, "text-info"], ["Leram", lidos, "text-ok"]].map(([r, v, c]) => (
          <div key={r as string} className="rounded-xl border border-line bg-black/25 py-3">
            <motion.p key={String(v)} initial={{ scale: 1.4, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} className={cn("font-mono text-2xl tabular-nums", c as string)}>{v as number}</motion.p>
            <p className="mt-0.5 text-[11px] text-subtle">{r}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const POLITICAS: { nome: string; modo: ModoDownload }[] = [
  { nome: "Notebooks de alunos", modo: "BLOQUEAR_EXECUTAVEIS" },
  { nome: "Equipe e professores", modo: "LIVRE" },
  { nome: "Estações das máquinas", modo: "SOMENTE_APROVADOS" },
];
const SUGESTOES = ["MinecraftInstaller.exe", "suporte_rover.stl", "caixa_mdf.svg", "jogo.apk", "plugin_cura.msi"];

/** Teste ao vivo das regras de download (a mesma função que o agente usa). */
export function DemoDownload() {
  const [arquivo, setArquivo] = useState("MinecraftInstaller.exe");
  return (
    <div className="glass flex h-full flex-col rounded-2xl border border-line-strong p-5 sm:p-6">
      <p className="eyebrow flex items-center gap-2"><FileDown className="size-3.5" />Tente baixar um arquivo</p>
      <input value={arquivo} onChange={(e) => setArquivo(e.target.value)} aria-label="Nome do arquivo"
        className="mt-3 h-11 rounded-lg border border-line-strong bg-black/40 px-3.5 font-mono text-[14px] outline-none transition focus:border-white/40" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGESTOES.map((s) => (
          <button key={s} onClick={() => setArquivo(s)} className={cn("rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors", s === arquivo ? "border-white/40 text-fg" : "border-line text-subtle hover:text-fg")}>{s}</button>
        ))}
      </div>
      <ul className="mt-5 flex-1 space-y-2">
        {POLITICAS.map((p) => {
          const r = downloadPermitido(arquivo || "x", p.modo);
          return (
            <li key={p.nome} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-300", r.ok ? "border-ok/25 bg-ok-soft/30" : "border-danger/30 bg-danger-soft/40")}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={String(r.ok)} initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", bounce: 0.5, duration: 0.4 }}
                  className={cn("grid size-7 shrink-0 place-items-center rounded-full", r.ok ? "bg-ok text-black" : "bg-danger text-white")}>
                  {r.ok ? <Check className="size-4" strokeWidth={3} /> : <X className="size-4" strokeWidth={3} />}
                </motion.span>
              </AnimatePresence>
              <div className="min-w-0">
                <p className="text-[13px] font-medium">Política {p.nome}</p>
                <p className={cn("truncate text-[11.5px]", r.ok ? "text-ok" : "text-danger")}>{r.ok ? "Download liberado" : `Bloqueado — ${r.motivo}`}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 flex items-center gap-2 text-[11.5px] text-subtle"><Monitor className="size-3.5" />Cada bloqueio aparece na tela do Líder.</p>
    </div>
  );
}
