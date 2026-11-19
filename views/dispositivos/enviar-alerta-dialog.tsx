"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Megaphone, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LaboratorioDTO, SeveridadeAlarme } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CartaoNotificacao, PRIORIDADE } from "@/views/dispositivos/dispositivo-ui";

type Destino = "todos" | "laboratorio" | "selecionados";
type Resultado = { lote: string; total: number; online: number; enfileirados: number };

const MODELOS = [
  { titulo: "Golpe de phishing em circulação", mensagem: "Não abra anexos de e-mails com o assunto \"Bolsa aprovada\". Em caso de dúvida, fale com o Líder no balcão.", prioridade: "CRITICO" as const },
  { titulo: "O espaço maker fecha em 15 minutos", mensagem: "Salve seus arquivos, retire suas peças das impressoras e devolva o notebook no balcão.", prioridade: "AVISO" as const },
  { titulo: "Laser #2 em manutenção hoje", mensagem: "A Cortadora a Laser CO2 #2 está em manutenção. Reservas foram remanejadas para o Laser #1.", prioridade: "INFO" as const },
];

export function EnviarAlertaDialog({ laboratorios, selecionados, total, onEnviado, trigger }: {
  laboratorios: LaboratorioDTO[];
  selecionados: string[];
  total: number;
  onEnviado?: (r: Resultado) => void;
  trigger: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [prioridade, setPrioridade] = useState<SeveridadeAlarme>("AVISO");
  const [destino, setDestino] = useState<Destino>("todos");
  const [lab, setLab] = useState(laboratorios[0]?.id ?? "");
  const [estilo, setEstilo] = useState<"windows" | "macos" | "mobile">("windows");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  function abrir(o: boolean) {
    setAberto(o);
    if (o) {
      setResultado(null);
      setDestino(selecionados.length ? "selecionados" : "todos");
    }
  }

  async function enviar() {
    setEnviando(true);
    try {
      const r = await fetch("/api/dispositivos/alertas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, mensagem, prioridade, destino, laboratorioId: destino === "laboratorio" ? lab : undefined, ids: destino === "selecionados" ? selecionados : undefined }),
      });
      const d = await r.json();
      if (!r.ok) return toast.error(d.error ?? "Não foi possível enviar.");
      setResultado(d);
      onEnviado?.(d);
    } catch {
      toast.error("Falha de comunicação.");
    } finally {
      setEnviando(false);
    }
  }

  const n = { titulo, mensagem, prioridade };
  const validos = titulo.trim().length >= 3 && mensagem.trim().length >= 5;

  return (
    <Dialog open={aberto} onOpenChange={abrir}>
      <span onClick={() => abrir(true)}>{trigger}</span>
      <DialogContent className="max-w-[880px] p-0">
        <div className="grid md:grid-cols-[minmax(0,1fr)_340px]">
          <div className="p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Megaphone className="size-4 text-signal" />Enviar alerta aos dispositivos</DialogTitle>
              <DialogDescription>A mensagem aparece na tela do usuário e fica registrada. Dispositivos offline recebem no próximo check-in.</DialogDescription>
            </DialogHeader>

            <AnimatePresence mode="wait">
              {resultado ? (
                <motion.div key="ok" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="py-10 text-center">
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.55 }} className="mx-auto grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
                    <CheckCircle2 className="size-7" />
                  </motion.span>
                  <p className="mt-5 text-lg font-semibold">Alerta enviado a {resultado.total} dispositivo{resultado.total > 1 ? "s" : ""}</p>
                  <p className="mt-1.5 text-sm text-muted">
                    <span className="text-ok">{resultado.online} recebendo agora</span>
                    {resultado.enfileirados > 0 && <> · <span className="text-warn">{resultado.enfileirados} na fila (offline)</span></>}
                  </p>
                  <p className="mt-1 text-xs text-subtle">Acompanhe as confirmações de leitura em “Alertas enviados”.</p>
                  <Button className="mt-6" variant="secondary" onClick={() => abrir(false)}>Fechar</Button>
                </motion.div>
              ) : (
                <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 space-y-4">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="mr-1 self-center text-[11px] text-subtle">Modelos:</span>
                    {MODELOS.map((m) => (
                      <button key={m.titulo} type="button" onClick={() => { setTitulo(m.titulo); setMensagem(m.mensagem); setPrioridade(m.prioridade); }}
                        className="rounded-full border border-line bg-white/[0.03] px-2.5 py-1 text-[11.5px] text-muted transition-colors hover:border-white/25 hover:text-fg">
                        {m.titulo}
                      </button>
                    ))}
                  </div>
                  <Field label="Título" htmlFor="al-titulo">
                    <Input id="al-titulo" value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: O espaço fecha em 15 minutos" />
                  </Field>
                  <Field label="Mensagem" htmlFor="al-msg" hint={`${mensagem.length}/400`}>
                    <Textarea id="al-msg" rows={3} value={mensagem} maxLength={400} onChange={(e) => setMensagem(e.target.value)} placeholder="O que o usuário precisa saber ou fazer." />
                  </Field>
                  <div>
                    <p className="mb-1.5 text-[13px] font-medium">Prioridade</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(Object.keys(PRIORIDADE) as SeveridadeAlarme[]).map((p) => (
                        <button key={p} type="button" onClick={() => setPrioridade(p)}
                          className={cn("rounded-lg border px-3 py-2 text-[13px] transition-all", prioridade === p ? PRIORIDADE[p].classe : "border-line text-muted hover:text-fg")}>
                          {PRIORIDADE[p].rotulo}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Enviar para" htmlFor="al-dest">
                      <Select value={destino} onValueChange={(v) => setDestino(v as Destino)}>
                        <SelectTrigger id="al-dest"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os dispositivos ({total})</SelectItem>
                          <SelectItem value="laboratorio">Um laboratório</SelectItem>
                          <SelectItem value="selecionados" disabled={!selecionados.length}>Selecionados ({selecionados.length})</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {destino === "laboratorio" && (
                      <Field label="Laboratório" htmlFor="al-lab">
                        <Select value={lab} onValueChange={setLab}>
                          <SelectTrigger id="al-lab"><SelectValue /></SelectTrigger>
                          <SelectContent>{laboratorios.map((l) => <SelectItem key={l.id} value={l.id}>{l.codigo} · {l.nome}</SelectItem>)}</SelectContent>
                        </Select>
                      </Field>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={() => abrir(false)}>Cancelar</Button>
                    <Button onClick={enviar} loading={enviando} disabled={!validos} variant={prioridade === "CRITICO" ? "danger" : "primary"}>
                      <Send />Enviar alerta
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Prévia */}
          <div className="relative flex flex-col overflow-hidden border-t border-line bg-black/40 p-5 md:border-l md:border-t-0">
            <div className="absolute inset-0 bg-grid opacity-50" />
            <p className="eyebrow relative">Prévia na tela do usuário</p>
            <div className="relative mt-3 grid grid-cols-3 rounded-lg border border-line bg-black/40 p-0.5">
              {([["windows", "Windows"], ["macos", "macOS"], ["mobile", "Tablet/celular"]] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setEstilo(v)} className={cn("rounded-md py-1 text-[11.5px] transition-colors", estilo === v ? "bg-white/10 text-fg" : "text-subtle hover:text-fg")}>{l}</button>
              ))}
            </div>
            <div className="relative mt-6 flex flex-1 items-start justify-center">
              <div className={cn("relative w-full overflow-hidden border border-white/10 bg-[#0b0c0e]", estilo === "mobile" ? "aspect-[9/16] max-w-[200px] rounded-[26px] border-[5px] border-zinc-800" : "aspect-[4/3] rounded-lg")}>
                <div className="absolute inset-0 bg-grid opacity-70" />
                <AnimatePresence mode="wait">
                  <motion.div
                    key={estilo + prioridade}
                    initial={{ opacity: 0, x: estilo === "mobile" ? 0 : 30, y: estilo === "mobile" ? -20 : 0 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", bounce: 0.3, duration: 0.55 }}
                    className={cn("absolute", estilo === "mobile" ? "inset-x-2 top-6" : estilo === "macos" ? "right-2 top-2 w-[78%]" : "bottom-2 right-2 w-[82%]")}
                  >
                    <CartaoNotificacao n={n} estilo={estilo} />
                  </motion.div>
                </AnimatePresence>
                {estilo === "windows" && <div className="absolute inset-x-0 bottom-0 h-0 border-t border-white/10" />}
              </div>
            </div>
            <p className="relative mt-4 text-[11px] leading-relaxed text-subtle">
              Alertas críticos ficam fixos na tela até o usuário confirmar a leitura. A confirmação volta para o Líder.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
