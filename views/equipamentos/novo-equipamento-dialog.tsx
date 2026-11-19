"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CRITICIDADE_LABEL, TIPO_LABEL } from "@/lib/labels";
import type { Criticidade, EquipamentoDTO, LaboratorioDTO, TipoEquipamento } from "@/lib/types";
import { fetchJson } from "@/lib/utils";

export function NovoEquipamentoDialog({ laboratorios, onCreated }: { laboratorios: LaboratorioDTO[]; onCreated: (e: EquipamentoDTO) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState<TipoEquipamento>("METROLOGIA");
  const [laboratorioId, setLaboratorioId] = useState(laboratorios[0]?.id ?? "");
  const [criticidade, setCriticidade] = useState<Criticidade>("MEDIA");
  const [duracao, setDuracao] = useState("60");
  const [requerCalibracao, setRequerCalibracao] = useState(true);

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setLoading(true);
    const f = Object.fromEntries(new FormData(ev.currentTarget));
    try {
      const { equipamento } = await fetchJson<{ equipamento: EquipamentoDTO }>("/api/equipamentos", {
        method: "POST",
        body: JSON.stringify({
          ...f, tipo, laboratorioId, criticidade, duracaoSlotMinutos: Number(duracao), requerCalibracao,
          intervaloCalibracaoDias: requerCalibracao ? Number(f.intervaloCalibracaoDias) || undefined : undefined,
        }),
      });
      onCreated(equipamento);
      toast.success(`${equipamento.nome} cadastrado`, { description: `Laboratório ${equipamento.laboratorio.codigo}` });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao cadastrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus />Novo equipamento</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastrar equipamento</DialogTitle>
          <DialogDescription>O equipamento fica disponível para reserva assim que for criado.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nome" htmlFor="nome">
            <Input id="nome" name="nome" placeholder="Ex.: Impressora 3D Prusa MK4" required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Laboratório">
              <Select value={laboratorioId} onValueChange={setLaboratorioId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{laboratorios.map((l) => <SelectItem key={l.id} value={l.id}>{l.codigo} · {l.nome}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Tipo">
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoEquipamento)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(TIPO_LABEL) as TipoEquipamento[]).map((t) => <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fabricante" htmlFor="fabricante"><Input id="fabricante" name="fabricante" placeholder="Opcional" /></Field>
            <Field label="Modelo" htmlFor="modelo"><Input id="modelo" name="modelo" placeholder="Opcional" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Patrimônio" htmlFor="patrimonio"><Input id="patrimonio" name="patrimonio" placeholder="PAT-000000" className="font-mono" /></Field>
            <Field label="Localização" htmlFor="localizacao"><Input id="localizacao" name="localizacao" placeholder="Sala, bancada…" /></Field>
          </div>
          <Field label="Endereço IP do controlador" htmlFor="enderecoIp" hint="Opcional. IPv4 na rede das máquinas, alcançado pelo gateway do espaço.">
            <Input id="enderecoIp" name="enderecoIp" placeholder="10.40.1.25" inputMode="decimal" className="font-mono" pattern="^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$" title="IPv4, ex.: 10.40.1.25" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duração do horário">
              <Select value={duracao} onValueChange={setDuracao}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["30", "60", "90", "120"].map((d) => <SelectItem key={d} value={d}>{d} minutos</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Criticidade">
              <Select value={criticidade} onValueChange={(v) => setCriticidade(v as Criticidade)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(CRITICIDADE_LABEL) as Criticidade[]).map((c) => <SelectItem key={c} value={c}>{CRITICIDADE_LABEL[c]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <div className="rounded-xl border border-line bg-white/[0.03] p-3">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-[13px] font-medium text-fg">Requer calibração periódica</span>
                <span className="block text-xs text-muted">Sem calibração válida, o equipamento não aceita reservas.</span>
              </span>
              <Switch checked={requerCalibracao} onCheckedChange={setRequerCalibracao} />
            </label>
            {requerCalibracao && (
              <Field label="Intervalo (dias)" htmlFor="intervaloCalibracaoDias" className="mt-3">
                <Input id="intervaloCalibracaoDias" name="intervaloCalibracaoDias" type="number" min={30} max={1825} defaultValue={365} required />
              </Field>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={loading}>Cadastrar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
