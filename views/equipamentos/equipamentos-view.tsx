"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { EquipmentIcon } from "@/components/equipment-icon";
import { Badge, CalibracaoBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader, SearchInput, td, th, tr } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CRITICIDADE_LABEL, STATUS_LABEL, TIPO_LABEL } from "@/lib/labels";
import type { EquipamentoDTO, LaboratorioDTO, StatusEquipamento } from "@/lib/types";
import { cn, fetchJson, formatData } from "@/lib/utils";
import { NovoEquipamentoDialog } from "@/views/equipamentos/novo-equipamento-dialog";

export function EquipamentosView({ inicial, laboratorios, podeGerenciar, podeAlterarStatus, topo }: {
  inicial: EquipamentoDTO[]; laboratorios: LaboratorioDTO[]; podeGerenciar: boolean; podeAlterarStatus: boolean; topo?: React.ReactNode;
}) {
  const [equipamentos, setEquipamentos] = useState(inicial);
  const [pendentes, setPendentes] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [lab, setLab] = useState("todos");
  const [paraRemover, setParaRemover] = useState<EquipamentoDTO | null>(null);
  const [removendo, setRemovendo] = useState(false);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return equipamentos.filter(
      (e) =>
        (lab === "todos" || e.laboratorio.id === lab) &&
        (!q || [e.nome, e.fabricante, e.modelo, e.patrimonio, e.localizacao, e.enderecoIp, TIPO_LABEL[e.tipo]].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [equipamentos, busca, lab]);

  /**
   * Alteração rápida de status — PATCH /api/equipamentos/:id via fetch.
   * UI otimista: muda na hora, confirma com o servidor e desfaz se falhar.
   */
  async function alterarStatus(id: string, status: StatusEquipamento) {
    const anterior = equipamentos.find((e) => e.id === id);
    if (!anterior || anterior.status === status) return;
    setEquipamentos((l) => l.map((e) => (e.id === id ? { ...e, status } : e)));
    setPendentes((s) => new Set(s).add(id));
    try {
      const { equipamento } = await fetchJson<{ equipamento: EquipamentoDTO }>(`/api/equipamentos/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setEquipamentos((l) => l.map((e) => (e.id === id ? { ...equipamento, reservasHoje: e.reservasHoje } : e)));
      toast.success(`${anterior.nome}: ${STATUS_LABEL[status]}`, {
        description: status === "MANUTENCAO" ? "Novas reservas bloqueadas. As existentes aparecem como conflito na agenda." : "Alteração registrada na auditoria.",
      });
    } catch (err) {
      setEquipamentos((l) => l.map((e) => (e.id === id ? anterior : e)));
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar status.");
    } finally {
      setPendentes((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  async function remover(eq: EquipamentoDTO) {
    setRemovendo(true);
    try {
      const r = await fetchJson<{ reservasCanceladas: number }>(`/api/equipamentos/${eq.id}`, { method: "DELETE" });
      setEquipamentos((l) => l.filter((e) => e.id !== eq.id));
      toast.success(`${eq.nome} removido`, { description: r.reservasCanceladas ? `${r.reservasCanceladas} reserva(s) cancelada(s).` : undefined });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover.");
    } finally {
      setRemovendo(false);
      setParaRemover(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ativos"
        title="Inventário de máquinas"
        description="Cadastro dos equipamentos: patrimônio, endereço de rede, status operacional e situação de calibração."
        actions={podeGerenciar ? <NovoEquipamentoDialog laboratorios={laboratorios} onCreated={(e) => setEquipamentos((l) => [...l, e])} /> : undefined}
      />
      {topo}

      <Card className="overflow-hidden">
        <CardHeader
          title={`${visiveis.length} de ${equipamentos.length} equipamentos`}
          actions={
            <>
              <Select value={lab} onValueChange={setLab}>
                <SelectTrigger className="h-8 w-56 text-[13px]" aria-label="Filtrar por laboratório"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os laboratórios</SelectItem>
                  {laboratorios.map((l) => <SelectItem key={l.id} value={l.id}>{l.codigo} · {l.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <SearchInput value={busca} onChange={setBusca} placeholder="Nome, modelo, patrimônio, IP…" />
            </>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr>
                <th className={th}>Equipamento</th>
                <th className={th}>Laboratório</th>
                <th className={th}>Tipo</th>
                <th className={th}>Calibração</th>
                <th className={th}>Status</th>
                <th className={th}>{podeAlterarStatus ? "Operacional" : "Hoje"}</th>
                <th className="w-px" />
              </tr>
            </thead>
            <tbody>
              {visiveis.map((e) => {
                const pending = pendentes.has(e.id);
                return (
                  <tr key={e.id} className={cn(tr, "group")}>
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <EquipmentIcon tipo={e.tipo} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-fg">{e.nome}</p>
                          <p className="truncate text-xs text-subtle">
                            {[e.fabricante, e.modelo].filter(Boolean).join(" ") || "—"}
                            {e.patrimonio && <span className="ml-2 font-mono text-[11px]">{e.patrimonio}</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      <p className="font-mono text-xs text-fg">{e.laboratorio.codigo}</p>
                      <p className="text-xs text-subtle">{e.laboratorio.unidadeSigla} · {e.localizacao ?? "—"}</p>
                      {e.enderecoIp && <p className="font-mono text-[11px] text-subtle">{e.enderecoIp}</p>}
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      <p className="text-[13px] text-muted">{TIPO_LABEL[e.tipo]}</p>
                      <p className="text-xs text-subtle">Criticidade {CRITICIDADE_LABEL[e.criticidade].toLowerCase()}</p>
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      <CalibracaoBadge situacao={e.calibracao} />
                      {e.proximaCalibracaoEm && <p className="mt-1 font-mono text-[11px] text-subtle">vence {formatData(e.proximaCalibracaoEm)}</p>}
                    </td>
                    <td className={td}>
                      {podeAlterarStatus ? (
                        <Select value={e.status} onValueChange={(v) => alterarStatus(e.id, v as StatusEquipamento)} disabled={pending}>
                          <SelectTrigger aria-label={`Status de ${e.nome}`} className="h-auto w-auto gap-1 border-transparent bg-transparent p-0 hover:border-transparent focus:ring-0 [&>svg]:size-3.5">
                            <SelectValue><StatusBadge status={e.status} /></SelectValue>
                          </SelectTrigger>
                          <SelectContent className="min-w-44">
                            {(Object.keys(STATUS_LABEL) as StatusEquipamento[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <StatusBadge status={e.status} />
                      )}
                    </td>
                    <td className={td}>
                      {podeAlterarStatus ? (
                        <div className="flex items-center gap-2.5">
                          <Switch checked={e.status !== "MANUTENCAO"} pending={pending} disabled={pending} onCheckedChange={(on) => alterarStatus(e.id, on ? "LIVRE" : "MANUTENCAO")} aria-label={`Alternar manutenção de ${e.nome}`} />
                          <span className="w-16 text-xs text-muted">{pending ? "Salvando…" : e.status === "MANUTENCAO" ? "Parado" : "Ativo"}</span>
                        </div>
                      ) : (
                        <Badge>{e.reservasHoje ?? 0} reservas</Badge>
                      )}
                    </td>
                    <td className={td}>
                      {podeGerenciar && (
                        <Button variant="ghost" size="icon" onClick={() => setParaRemover(e)} className="opacity-0 hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Remover ${e.nome}`}>
                          <Trash2 />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visiveis.length === 0 && (equipamentos.length === 0
            ? <EmptyState title="Nenhuma máquina cadastrada ainda" text={podeGerenciar ? "Crie uma área em Laboratórios e depois use “Novo equipamento”. Assim que você cadastrar, os alunos já podem reservar." : "O Líder do espaço ainda não cadastrou as máquinas."} />
            : <EmptyState title="Nenhum equipamento encontrado" text="Ajuste a busca ou o filtro de laboratório." />)}
        </div>
      </Card>

      <ConfirmDialog
        open={!!paraRemover}
        onOpenChange={(o) => !o && setParaRemover(null)}
        title={`Remover ${paraRemover?.nome ?? "equipamento"}?`}
        description="O equipamento sai do inventário ativo e as reservas futuras são canceladas. O histórico é preservado."
        confirmLabel="Remover"
        loading={removendo}
        onConfirm={() => paraRemover && remover(paraRemover)}
      />
    </div>
  );
}
