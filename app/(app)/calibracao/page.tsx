import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { EquipamentoModel } from "@/models/equipamento.model";
import { ManutencaoModel } from "@/models/manutencao.model";
import { CalibracaoView } from "@/views/calibracao/calibracao-view";

export const metadata: Metadata = { title: "Calibração" };

export default async function CalibracaoPage() {
  const session = await requirePageSession("manutencao:ver");
  const [equipamentos, historico] = await Promise.all([EquipamentoModel.listarAtivos(), ManutencaoModel.listarRecentes(40)]);
  return <CalibracaoView equipamentosIniciais={equipamentos} historicoInicial={historico} podeRegistrar={can(session.role, "manutencao:registrar")} />;
}
