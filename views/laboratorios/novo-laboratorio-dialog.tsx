"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchJson } from "@/lib/utils";

export function NovoLaboratorioDialog({ unidades }: { unidades: { id: string; nome: string; sigla: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unidadeId, setUnidadeId] = useState(unidades[0]?.id ?? "");

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setLoading(true);
    try {
      const f = Object.fromEntries(new FormData(ev.currentTarget));
      const { laboratorio } = await fetchJson<{ laboratorio: { codigo: string; nome: string } }>("/api/laboratorios", { method: "POST", body: JSON.stringify({ ...f, unidadeId }) });
      toast.success(`Laboratório ${laboratorio.codigo} criado`, { description: laboratorio.nome });
      setOpen(false);
      router.refresh(); // a página é renderizada no servidor: recarrega os dados
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus />Novo laboratório</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar laboratório</DialogTitle>
          <DialogDescription>Depois de criado, cadastre os equipamentos em “Equipamentos”.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Unidade">
            <Select value={unidadeId} onValueChange={setUnidadeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.sigla} · {u.nome}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-5 gap-3">
            <Field label="Código" htmlFor="codigo" className="col-span-2"><Input id="codigo" name="codigo" placeholder="MET-02" className="font-mono uppercase" required /></Field>
            <Field label="Nome" htmlFor="nome" className="col-span-3"><Input id="nome" name="nome" placeholder="Metrologia Elétrica" required /></Field>
          </div>
          <Field label="Descrição" htmlFor="descricao"><Input id="descricao" name="descricao" placeholder="Opcional" /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={loading}>Criar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
