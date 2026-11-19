import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { lerTelemetria, serieRecente } from "@/lib/telemetria";
import { AgendamentoModel } from "@/models/agendamento.model";
import { AlarmeModel, ComandoModel } from "@/models/alarme.model";
import { EquipamentoModel } from "@/models/equipamento.model";
import { MaquinaDetalheView } from "@/views/maquinas/maquina-detalhe-view";

export const metadata: Metadata = { title: "Máquina" };

export default async function MaquinaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession("maquina:monitorar");
  const { id } = await params;
  const [equipamento, [maquina]] = await Promise.all([EquipamentoModel.buscarDTO(id), EquipamentoModel.paraTelemetria(id)]);
  if (!equipamento || !maquina) notFound();

  const agora = new Date();
  const [ativos, historico, comandos, reservas] = await Promise.all([
    AlarmeModel.ativos(id),
    AlarmeModel.historico(id),
    ComandoModel.listar(id),
    AgendamentoModel.listarDoEquipamento(id),
  ]);
  return (
    <MaquinaDetalheView
      equipamento={equipamento}
      leituraInicial={lerTelemetria(maquina, agora)}
      serieInicial={serieRecente(maquina, agora, 40, 2000)}
      alarmesAtivos={ativos}
      historicoAlarmes={historico}
      comandosIniciais={comandos}
      reservas={reservas}
      podeComandar={can(session.role, "maquina:comandar")}
    />
  );
}
