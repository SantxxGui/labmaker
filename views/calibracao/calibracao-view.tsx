"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck, FileBadge } from "lucide-react";
import { Badge, CalibracaoBadge, StatusBadge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader, Segmented, td, th, tr } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MANUTENCAO_LABEL } from "@/lib/labels";
import { hojeNoLab, situacaoCalibracao } from "@/lib/slots";
import type { EquipamentoDTO, ManutencaoDTO, TipoManutencao } from "@/lib/types";
import { cn, diasAte, fetchJson, formatData } from "@/lib/utils";

type Filtro = "atencao" | "todos";
const ORDEM = { VENCIDA: 0, PENDENTE: 0, A_VENCER: 1, EM_DIA: 2, NAO_APLICAVEL: 3 } as const;
const TOM: Record<TipoManutencao, Tone> = { CALIBRACAO: "accent", PREVENTIVA: "info", CORRETIVA: "warn" };

export function CalibracaoView({ equipamentosIniciais, historicoInicial, podeRegistrar }: {
  equipamentosIniciais: EquipamentoDTO[]; historicoInicial: ManutencaoDTO[]; podeRegistrar: boolean;
}) {
  const [equipamentos, setEquipamentos] = useState(equipamentosIniciais);
  const [historico, setHistorico] = useState(historicoInicial);
  const [filtro, setFiltro] = useState<Filtro>("atencao");
  const [alvo, setAlvo] = useState<EquipamentoDTO | null>(null);

  const controlados = useMemo(
    () => equipamentos.filter((e) => e.requerCalibracao).sort((a, b) => ORDEM[a.calibracao] - ORDEM[b.calibracao] || (a.proximaCalibracaoEm ?? "").localeCompare(b.proximaCalibracaoEm ?? "")),
    [equipamentos],
  );
  const atencao = controlados.filter((e) => e.calibracao !== "EM_DIA");
  const lista = filtro === "atencao" ? atencao : controlados;
  const n = (s: string[]) => controlados.filter((e) => s.includes(e.calibracao)).length;

  function onRegistrada(m: ManutencaoDTO, proxima: string | undefined, liberou: boolean) {
    setHistorico((h) => [m, ...h]);
    setEquipamentos((l) =>
      l.map((e) => {
        if (e.id !== m.equipamento.id) return e;
        const novo = { ...e, proximaCalibracaoEm: proxima ?? e.proximaCalibracaoEm, status: liberou ? ("LIVRE" as const) : e.status };
        return { ...novo, calibracao: situacaoCalibracao(novo) };
      }),
    );
    setAlvo(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Ativos" title="Calibração e manutenção" description="Controle de vencimentos e histórico de intervenções. Equipamento com calibração vencida é bloqueado para reservas automaticamente." />

      <div className="grid grid-cols-3 gap-3">
        <Resumo label="Vencidas" valor={n(["VENCIDA", "PENDENTE"])} tom="danger" texto="Reservas bloqueadas" />
        <Resumo label="A vencer em 30 dias" valor={n(["A_VENCER"])} tom="warn" texto="Programar calibração" />
        <Resumo label="Em dia" valor={n(["EM_DIA"])} tom="ok" texto={`de ${controlados.length} controlados`} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Equipamentos controlados"
          actions={<Segmented value={filtro} onChange={setFiltro} options={[{ value: "atencao", label: "Requer atenção", count: atencao.length }, { value: "todos", label: "Todos" }]} />}
        />
        {lista.length === 0 ? (
          <EmptyState icon={<ClipboardCheck />} title="Tudo em dia" text="Nenhum equipamento com calibração vencida ou próxima do vencimento." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Equipamento</th>
                  <th className={th}>Laboratório</th>
                  <th className={th}>Situação</th>
                  <th className={th}>Vencimento</th>
                  <th className={th}>Intervalo</th>
                  <th className={th}>Status</th>
                  <th className="w-px" />
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => {
                  const dias = e.proximaCalibracaoEm ? diasAte(e.proximaCalibracaoEm) : null;
                  return (
                    <tr key={e.id} className={tr}>
                      <td className={td}>
                        <p className="font-medium text-fg">{e.nome}</p>
                        <p className="font-mono text-[11px] text-subtle">{e.patrimonio ?? "s/ patrimônio"}</p>
                      </td>
                      <td className={cn(td, "font-mono text-xs text-muted")}>{e.laboratorio.codigo}</td>
                      <td className={td}><CalibracaoBadge situacao={e.calibracao} /></td>
                      <td className={td}>
                        <p className="font-mono text-[13px] text-fg tabular-nums">{e.proximaCalibracaoEm ? formatData(e.proximaCalibracaoEm) : "—"}</p>
                        {dias !== null && <p className={cn("text-[11px]", dias < 0 ? "font-medium text-danger" : "text-subtle")}>{dias < 0 ? `vencida há ${Math.abs(dias)} dias` : `faltam ${dias} dias`}</p>}
                      </td>
                      <td className={cn(td, "text-[13px] text-muted")}>{e.intervaloCalibracaoDias ? `${e.intervaloCalibracaoDias} dias` : "—"}</td>
                      <td className={td}><StatusBadge status={e.status} /></td>
                      <td className={cn(td, "text-right")}>
                        {podeRegistrar && <Button size="sm" variant="secondary" onClick={() => setAlvo(e)}>Registrar</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Histórico de intervenções"
          description="Calibrações, preventivas e corretivas registradas."
          actions={podeRegistrar ? <Button size="sm" variant="secondary" onClick={() => setAlvo(equipamentos[0] ?? null)}>Registrar em outro equipamento</Button> : undefined}
        />
        <ul>
          {historico.map((m) => (
            <li key={m.id} className="grid gap-x-6 gap-y-1 border-t border-line px-5 py-3.5 first:border-t-0 md:grid-cols-[110px_minmax(0,1fr)_200px]">
              <div>
                <p className="font-mono text-[13px] text-fg tabular-nums">{formatData(m.realizadaEm)}</p>
                <Badge tone={TOM[m.tipo]} className="mt-1">{MANUTENCAO_LABEL[m.tipo]}</Badge>
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-fg">{m.equipamento.nome}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{m.descricao}</p>
              </div>
              <div className="text-[12px] text-subtle md:text-right">
                <p>{m.responsavel.nome}</p>
                {m.certificado && <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-muted"><FileBadge className="size-3" />{m.certificado}</p>}
                {m.validadeAte && <p className="mt-0.5">válida até {formatData(m.validadeAte)}</p>}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {alvo && <RegistrarDialog equipamentos={equipamentos} inicial={alvo} onClose={() => setAlvo(null)} onRegistrada={onRegistrada} />}
    </div>
  );
}

function Resumo({ label, valor, texto, tom }: { label: string; valor: number; texto: string; tom: "danger" | "warn" | "ok" }) {
  const cor = { danger: "text-danger", warn: "text-warn", ok: "text-ok" }[tom];
  return (
    <div className="glass rounded-2xl border border-line p-5">
      <p className="eyebrow">{label}</p>
      <p className={cn("mt-3 text-[34px] font-semibold leading-none tracking-[-0.04em] tabular-nums", valor > 0 ? cor : "text-fg")}>{valor}</p>
      <p className="mt-3 text-xs text-muted">{texto}</p>
    </div>
  );
}

function RegistrarDialog({ equipamentos, inicial, onClose, onRegistrada }: {
  equipamentos: EquipamentoDTO[]; inicial: EquipamentoDTO; onClose: () => void;
  onRegistrada: (m: ManutencaoDTO, proxima: string | undefined, liberou: boolean) => void;
}) {
  const [equipamentoId, setEquipamentoId] = useState(inicial.id);
  const eq = equipamentos.find((e) => e.id === equipamentoId) ?? inicial;
  const [tipo, setTipo] = useState<TipoManutencao>(inicial.requerCalibracao ? "CALIBRACAO" : "PREVENTIVA");
  const [liberar, setLiberar] = useState(inicial.status === "MANUTENCAO");
  const [loading, setLoading] = useState(false);
  const hoje = hojeNoLab();

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setLoading(true);
    const f = Object.fromEntries(new FormData(ev.currentTarget));
    try {
      const r = await fetchJson<{ manutencao: ManutencaoDTO; proximaCalibracaoEm?: string }>("/api/manutencoes", {
        method: "POST",
        body: JSON.stringify({ ...f, equipamentoId, tipo, liberarEquipamento: liberar }),
      });
      toast.success(`${MANUTENCAO_LABEL[tipo]} registrada`, {
        description: r.proximaCalibracaoEm ? `${eq.nome} · válida até ${formatData(r.proximaCalibracaoEm)}` : eq.nome,
      });
      onRegistrada(r.manutencao, r.proximaCalibracaoEm, liberar);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao registrar.");
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !loading && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar intervenção</DialogTitle>
          <DialogDescription>O registro entra no histórico e na trilha de auditoria.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Equipamento">
            <Select value={equipamentoId} onValueChange={setEquipamentoId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{equipamentos.map((e) => <SelectItem key={e.id} value={e.id}>{e.laboratorio.codigo} · {e.nome}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoManutencao)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(MANUTENCAO_LABEL) as TipoManutencao[]).map((t) => <SelectItem key={t} value={t}>{MANUTENCAO_LABEL[t]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Realizada em" htmlFor="realizadaEm">
              <Input id="realizadaEm" name="realizadaEm" type="date" defaultValue={hoje} max={hoje} required />
            </Field>
          </div>
          {tipo === "CALIBRACAO" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nº do certificado" htmlFor="certificado"><Input id="certificado" name="certificado" placeholder="CHK-2026-0000" className="font-mono" /></Field>
              <Field label="Válida até" htmlFor="validadeAte" hint={eq.intervaloCalibracaoDias ? `Em branco = +${eq.intervaloCalibracaoDias} dias` : "Obrigatória para este equipamento"}>
                <Input id="validadeAte" name="validadeAte" type="date" min={hoje} required={!eq.intervaloCalibracaoDias} />
              </Field>
            </div>
          )}
          <Field label="Descrição do serviço" htmlFor="descricao">
            <Textarea id="descricao" name="descricao" required minLength={5} maxLength={300} placeholder="O que foi feito, por quem (laboratório externo), observações…" />
          </Field>
          {eq.status === "MANUTENCAO" && (
            <label className="flex items-center justify-between gap-3 rounded-md border border-line bg-raised p-3">
              <span>
                <span className="block text-[13px] font-medium text-fg">Liberar equipamento</span>
                <span className="block text-xs text-muted">Volta para “Disponível” e aceita reservas novamente.</span>
              </span>
              <Switch checked={liberar} onCheckedChange={setLiberar} />
            </label>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button type="submit" loading={loading}>Registrar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
