import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AgendamentoModel } from "@/models/agendamento.model";
import { EquipamentoModel } from "@/models/equipamento.model";
import { AgendaView } from "@/views/agenda/agenda-view";

export const metadata: Metadata = { title: "Agenda geral" };

export default async function AgendaPage() {
  const session = await requirePageSession("reserva:ver_todas");
  const [reservas, equipamentos] = await Promise.all([AgendamentoModel.listarProximos(200), EquipamentoModel.listarAtivos()]);
  return <AgendaView inicial={reservas} equipamentos={equipamentos} podeCancelar={can(session.role, "reserva:cancelar_qualquer")} />;
}
