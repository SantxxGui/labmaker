import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { lerTelemetria } from "@/lib/telemetria";
import { AlarmeModel } from "@/models/alarme.model";
import { AcaoDispositivoModel, DispositivoModel } from "@/models/dispositivo.model";
import { EquipamentoModel } from "@/models/equipamento.model";
import { PainelModel } from "@/models/painel.model";
import { ChaoDeFabrica } from "@/views/painel/chao-de-fabrica";
import { PainelView } from "@/views/painel/painel-view";
import { ParqueTI } from "@/views/painel/parque-ti";

export const metadata: Metadata = { title: "Painel" };

export default async function PainelPage() {
  const session = await requirePageSession("painel:ver");
  const monitora = can(session.role, "maquina:monitorar");
  const ti = can(session.role, "dispositivo:ver");
  const [dados, maquinas, alarmes, dispositivos, lotes] = await Promise.all([
    PainelModel.resumo(),
    monitora ? EquipamentoModel.paraTelemetria() : [],
    monitora ? AlarmeModel.ativos() : [],
    ti ? DispositivoModel.listarPainel() : [],
    ti ? AcaoDispositivoModel.lotes(1) : [],
  ]);
  const agora = new Date();
  return (
    <PainelView
      dados={dados}
      nome={session.nome}
      chaoDeFabrica={
        <>
          {monitora && <ChaoDeFabrica leituras={maquinas.map((m) => lerTelemetria(m, agora))} alarmes={alarmes} />}
          {ti && <ParqueTI dispositivos={dispositivos} lotes={lotes} />}
        </>
      }
    />
  );
}
