import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { lerTelemetria, serieRecente } from "@/lib/telemetria";
import { AlarmeModel } from "@/models/alarme.model";
import { EquipamentoModel } from "@/models/equipamento.model";
import { LaboratorioModel } from "@/models/laboratorio.model";
import { AbasMaquinas } from "@/views/maquinas/abas-maquinas";
import { MaquinasView } from "@/views/maquinas/maquinas-view";

export const metadata: Metadata = { title: "Máquinas" };

export default async function MaquinasPage() {
  const session = await requirePageSession("equipamento:ver");
  // Quem não monitora a operação (ex.: pesquisador) vê só o inventário
  if (!can(session.role, "maquina:monitorar")) redirect("/equipamentos/inventario");

  const agora = new Date();
  const [equipamentos, laboratorios, maquinas, alarmes] = await Promise.all([
    EquipamentoModel.listarAtivos(),
    LaboratorioModel.listar(),
    EquipamentoModel.paraTelemetria(),
    AlarmeModel.ativos(),
  ]);
  const series = Object.fromEntries(
    maquinas.map((m) => [m.id, Object.values(serieRecente(m, agora, 40, 2500))[0] ?? []]),
  );
  return (
    <MaquinasView
      equipamentos={equipamentos}
      laboratorios={laboratorios}
      leiturasIniciais={maquinas.map((m) => lerTelemetria(m, agora))}
      seriesIniciais={series}
      alarmesIniciais={alarmes}
      topo={<AbasMaquinas atual="monitoramento" />}
    />
  );
}
