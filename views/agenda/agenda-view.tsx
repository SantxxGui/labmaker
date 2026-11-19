"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarX2, X } from "lucide-react";
import { EquipmentIcon } from "@/components/equipment-icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, EmptyState, PageHeader, SearchInput, Segmented } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { diaNoLab } from "@/lib/slots";
import type { AgendamentoDTO, EquipamentoDTO } from "@/lib/types";
import { TIMEZONE, capitalizar, cn, fetchJson, formatHora } from "@/lib/utils";

type Filtro = "todas" | "hoje" | "conflitos";
const fmtDia = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: TIMEZONE });

function rotuloDia(chave: string, hoje: string, amanha: string) {
  if (chave === hoje) return "Hoje";
  if (chave === amanha) return "Amanhã";
  return capitalizar(fmtDia.format(new Date(`${chave}T12:00:00-03:00`)));
}

function relativo(r: AgendamentoDTO, agora: number) {
  const ini = new Date(r.inicio).getTime();
  if (ini <= agora && agora < new Date(r.fim).getTime()) return { texto: "Em andamento", ativo: true };
  const min = Math.round((ini - agora) / 60_000);
  if (min < 0 || min > 12 * 60) return null;
  return { texto: min < 60 ? `em ${min} min` : `em ${Math.round(min / 60)} h`, ativo: false };
}

export function AgendaView({ inicial, equipamentos, podeCancelar }: {
  inicial: AgendamentoDTO[]; equipamentos: EquipamentoDTO[]; podeCancelar: boolean;
}) {
  const [reservas, setReservas] = useState(inicial);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const [alvo, setAlvo] = useState<AgendamentoDTO | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /** Reserva em equipamento que ficou indisponível depois = conflito a resolver. */
  const parados = useMemo(
    () => new Set(equipamentos.filter((e) => e.status === "MANUTENCAO" || e.calibracao === "VENCIDA" || e.calibracao === "PENDENTE").map((e) => e.id)),
    [equipamentos],
  );
  const hoje = diaNoLab(new Date(agora));
  const amanha = diaNoLab(new Date(agora + 86_400_000));
  const conflitos = reservas.filter((r) => parados.has(r.equipamento.id)).length;

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const map = new Map<string, AgendamentoDTO[]>();
    for (const r of reservas) {
      if (filtro === "hoje" && diaNoLab(r.inicio) !== hoje) continue;
      if (filtro === "conflitos" && !parados.has(r.equipamento.id)) continue;
      if (q && ![r.usuario?.nome, r.usuario?.email, r.equipamento.nome, r.finalidade, r.equipamento.laboratorioCodigo].some((v) => v?.toLowerCase().includes(q))) continue;
      const k = diaNoLab(r.inicio);
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()];
  }, [reservas, filtro, busca, hoje, parados]);

  async function cancelar(r: AgendamentoDTO) {
    setCancelando(true);
    try {
      await fetchJson(`/api/agendamentos/${r.id}`, { method: "DELETE" });
      setReservas((l) => l.filter((x) => x.id !== r.id));
      toast.success("Reserva cancelada", { description: "O horário voltou a ficar disponível." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao cancelar.");
    } finally {
      setCancelando(false);
      setAlvo(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operação" title="Agenda geral" description="Todas as reservas confirmadas dos laboratórios, agrupadas por dia." />
      <Card className="overflow-hidden">
        <CardHeader
          title={`${reservas.length} reservas futuras`}
          actions={
            <>
              <Segmented
                value={filtro}
                onChange={setFiltro}
                options={[{ value: "todas", label: "Todas" }, { value: "hoje", label: "Hoje" }, { value: "conflitos", label: "Conflitos", count: conflitos }]}
              />
              <SearchInput value={busca} onChange={setBusca} placeholder="Buscar pessoa, equipamento, projeto…" />
            </>
          }
        />
        {grupos.length === 0 ? (
          <EmptyState icon={<CalendarX2 />} title={filtro === "conflitos" ? "Nenhum conflito" : "Nenhuma reserva encontrada"} text={filtro === "conflitos" ? "Não há reservas em equipamentos parados." : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              {grupos.map(([dia, itens]) => (
                <div key={dia}>
                  <div className="flex items-center justify-between border-t border-line bg-raised px-5 py-2 first:border-t-0">
                    <span className="text-[12.5px] font-medium text-fg">{rotuloDia(dia, hoje, amanha)}</span>
                    <span className="font-mono text-[11px] text-subtle">{itens.length} {itens.length === 1 ? "reserva" : "reservas"}</span>
                  </div>
                  <ul>
                    {itens.map((r) => {
                      const rel = relativo(r, agora);
                      const conflito = parados.has(r.equipamento.id);
                      return (
                        <li key={r.id} className={cn("group grid grid-cols-[130px_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1fr)_40px] items-center gap-4 border-t border-line px-5 py-3 transition-colors hover:bg-raised/60", conflito && "bg-danger-soft/40")}>
                          <div>
                            <p className="font-mono text-[13px] text-fg tabular-nums">
                              {formatHora(r.inicio)}<span className="text-subtle"> – {formatHora(r.fim)}</span>
                            </p>
                            {rel && <p className={cn("mt-0.5 text-[11px]", rel.ativo ? "font-medium text-info" : "text-subtle")}>{rel.texto}</p>}
                          </div>
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar nome={r.usuario?.nome ?? "?"} />
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-fg">{r.usuario?.nome}</p>
                              <p className="truncate text-[11.5px] text-subtle">{r.usuario?.email}</p>
                            </div>
                          </div>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <EquipmentIcon tipo={r.equipamento.tipo} className="size-8" />
                            <div className="min-w-0">
                              <p className="truncate text-[13px] text-fg">{r.equipamento.nome}</p>
                              <p className="font-mono text-[11px] text-subtle">{r.equipamento.laboratorioCodigo}</p>
                            </div>
                          </div>
                          <div className="min-w-0">
                            {conflito ? (
                              <Badge tone="danger"><AlertTriangle className="size-3" /> Equipamento parado</Badge>
                            ) : (
                              <p className="truncate text-[12.5px] text-muted" title={r.finalidade ?? undefined}>{r.finalidade ?? "—"}</p>
                            )}
                          </div>
                          {podeCancelar ? (
                            <button onClick={() => setAlvo(r)} aria-label={`Cancelar reserva de ${r.usuario?.nome}`} title="Cancelar reserva" className="grid size-8 place-items-center rounded-md text-subtle opacity-0 transition hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100">
                              <X className="size-4" />
                            </button>
                          ) : <span />}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!alvo}
        onOpenChange={(o) => !o && setAlvo(null)}
        title="Cancelar reserva?"
        description={alvo ? `${alvo.usuario?.nome ?? "Usuário"} · ${alvo.equipamento.nome} · ${formatHora(alvo.inicio)}–${formatHora(alvo.fim)}. A ação fica registrada na auditoria.` : undefined}
        confirmLabel="Cancelar reserva"
        loading={cancelando}
        onConfirm={() => alvo && cancelar(alvo)}
      />
    </div>
  );
}
