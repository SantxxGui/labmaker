"use client";

import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { EquipmentIcon } from "@/components/equipment-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { AgendamentoDTO } from "@/lib/types";
import { fetchJson, formatDataCurta, formatHora } from "@/lib/utils";

export function MinhasReservas({ reservas, onCancelada }: { reservas: AgendamentoDTO[]; onCancelada: (id: string) => void }) {
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);

  async function cancelar(id: string) {
    setCancelando(id);
    try {
      await fetchJson(`/api/agendamentos/${id}`, { method: "DELETE" });
      onCancelada(id);
      toast.success("Reserva cancelada", { description: "O horário voltou a ficar disponível." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao cancelar.");
    } finally {
      setCancelando(null);
      setConfirmando(null);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-fg">Minhas reservas</h3>
        <span className="rounded-[5px] bg-raised px-1.5 font-mono text-[11px] text-muted">{reservas.length}</span>
      </div>
      {reservas.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">Você não tem reservas futuras.</p>
      ) : (
        <ul className="max-h-[340px] overflow-y-auto">
          {reservas.map((r) => {
            const iniciou = new Date(r.inicio) <= new Date();
            return (
              <li key={r.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                <EquipmentIcon tipo={r.equipamento.tipo} className="size-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-fg">{r.equipamento.nome}</p>
                  <p className="text-[11.5px] text-subtle">
                    {formatDataCurta(r.inicio)} · <span className="font-mono">{formatHora(r.inicio)}–{formatHora(r.fim)}</span>
                  </p>
                </div>
                {iniciou ? (
                  <span className="text-[11px] font-medium text-info">em andamento</span>
                ) : confirmando === r.id ? (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="danger" loading={cancelando === r.id} onClick={() => cancelar(r.id)}>Cancelar</Button>
                    <Button size="icon" variant="ghost" onClick={() => setConfirmando(null)} aria-label="Manter reserva"><X /></Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmando(r.id)}>Cancelar</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
