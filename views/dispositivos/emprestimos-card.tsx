"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowDownToLine, HandHelping, Laptop } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DispositivoPainelDTO, EmprestimoDTO } from "@/lib/types";
import { LAB } from "@/lib/slots";
import { cn, tempoRelativo } from "@/lib/utils";

type Aluno = { id: string; nome: string; matricula: string | null };

const hora = (d: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
/** Valor para <input type="datetime-local"> no fuso do navegador */
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** Fechamento do espaço hoje (LAB.fechamento) ou daqui a 4 h, o que vier primeiro — o padrão mais comum no balcão. */
function prazoPadrao() {
  const agora = new Date();
  const fim = new Date(agora); fim.setHours(LAB.fechamento, 0, 0, 0);
  const quatro = new Date(agora.getTime() + 4 * 3_600_000);
  return fim > agora && fim < quatro ? fim : quatro;
}

export function EmprestimosCard({ emprestimos, dispositivos, alunos, podeGerenciar, onMudou }: {
  emprestimos: EmprestimoDTO[];
  dispositivos: DispositivoPainelDTO[];
  alunos: Aluno[];
  podeGerenciar: boolean;
  onMudou: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [dispositivoId, setDispositivoId] = useState("");
  const [usuarioId, setUsuarioId] = useState("");
  const [prazo, setPrazo] = useState(() => local(prazoPadrao()));
  const [salvando, setSalvando] = useState(false);
  const [devolvendo, setDevolvendo] = useState<string | null>(null);

  const emprestados = new Set(emprestimos.map((e) => e.dispositivo.id));
  const comAparelho = new Set(emprestimos.map((e) => e.usuario.id));
  const disponiveis = useMemo(
    () => dispositivos.filter((d) => d.tipo !== "DESKTOP" && !d.bloqueado && !emprestados.has(d.id)),
    [dispositivos, emprestimos], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const atrasados = emprestimos.filter((e) => e.situacao === "ATRASADO").length;

  async function emprestar() {
    setSalvando(true);
    try {
      const r = await fetch("/api/emprestimos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dispositivoId, usuarioId, prazoEm: new Date(prazo).toISOString() }),
      });
      const j = await r.json();
      if (!r.ok) return toast.error(j.error ?? "Não foi possível emprestar.");
      toast.success(`${j.emprestimo.dispositivo.hostname} emprestado para ${j.emprestimo.usuario.nome.split(" ")[0]}.`);
      setAberto(false); setDispositivoId(""); setUsuarioId("");
      onMudou();
    } finally { setSalvando(false); }
  }

  async function devolver(e: EmprestimoDTO) {
    setDevolvendo(e.id);
    try {
      const r = await fetch(`/api/emprestimos/${e.id}/devolver`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json();
      if (!r.ok) return toast.error(j.error ?? "Não foi possível registrar a devolução.");
      toast.success(`${e.dispositivo.hostname} de volta ao balcão.`);
      onMudou();
    } finally { setDevolvendo(null); }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={<span className="flex items-center gap-2"><HandHelping className="size-4 text-signal" />Empréstimos</span>}
        description={`${emprestimos.length} fora do balcão${atrasados ? ` · ${atrasados} atrasado${atrasados > 1 ? "s" : ""}` : ""}`}
        actions={podeGerenciar && <Button size="sm" variant="secondary" onClick={() => setAberto(true)}>Emprestar</Button>}
      />
      <ul className="max-h-[300px] overflow-y-auto">
        {emprestimos.length === 0 && <li className="px-5 pb-6 text-sm text-muted">Todos os notebooks estão no balcão.</li>}
        <AnimatePresence initial={false}>
          {emprestimos.map((e) => (
            <motion.li key={e.id} layout exit={{ opacity: 0, x: 20 }} className="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0">
              <Laptop className={cn("size-4 shrink-0", e.situacao === "ATRASADO" ? "text-danger" : "text-subtle")} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-fg"><span className="font-mono">{e.dispositivo.hostname}</span> · {e.usuario.nome.split(" ").slice(0, 2).join(" ")}</p>
                <p className="text-[11px] text-subtle">
                  {e.situacao === "ATRASADO"
                    ? <span className="text-danger">atrasado — prazo era {tempoRelativo(e.prazoEm)}</span>
                    : <>devolve {hora(e.prazoEm)}</>}
                </p>
              </div>
              {e.situacao === "ATRASADO" && <Badge tone="danger">Atraso</Badge>}
              {podeGerenciar && (
                <Button size="sm" variant="ghost" loading={devolvendo === e.id} onClick={() => devolver(e)} aria-label={`Registrar devolução de ${e.dispositivo.hostname}`}>
                  <ArrowDownToLine />
                </Button>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Emprestar notebook</DialogTitle>
            <DialogDescription>Um aparelho por aluno, prazo de até 7 dias. O aluno aparece como responsável no painel até a devolução.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Aparelho" htmlFor="em-disp">
              <Select value={dispositivoId} onValueChange={setDispositivoId}>
                <SelectTrigger id="em-disp"><SelectValue placeholder={disponiveis.length ? "Escolha um aparelho no balcão" : "Nenhum disponível"} /></SelectTrigger>
                <SelectContent>{disponiveis.map((d) => <SelectItem key={d.id} value={d.id}>{d.hostname} · {d.modelo}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Aluno" htmlFor="em-aluno">
              <Select value={usuarioId} onValueChange={setUsuarioId}>
                <SelectTrigger id="em-aluno"><SelectValue placeholder="Escolha o aluno" /></SelectTrigger>
                <SelectContent>
                  {alunos.map((a) => (
                    <SelectItem key={a.id} value={a.id} disabled={comAparelho.has(a.id)}>
                      {a.nome}{a.matricula ? ` · ${a.matricula}` : ""}{comAparelho.has(a.id) ? " (já está com um)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Devolver até" htmlFor="em-prazo">
              <Input id="em-prazo" type="datetime-local" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </Field>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={emprestar} loading={salvando} disabled={!dispositivoId || !usuarioId}>Confirmar empréstimo</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
