import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { EquipamentoModel } from "@/models/equipamento.model";
import { LaboratorioModel } from "@/models/laboratorio.model";
import { EquipamentosView } from "@/views/equipamentos/equipamentos-view";
import { AbasMaquinas } from "@/views/maquinas/abas-maquinas";

export const metadata: Metadata = { title: "Inventário de equipamentos" };

export default async function InventarioPage() {
  const session = await requirePageSession("equipamento:ver");
  const [equipamentos, laboratorios] = await Promise.all([EquipamentoModel.listarAtivos(), LaboratorioModel.listar()]);
  return (
    <EquipamentosView
      inicial={equipamentos}
      laboratorios={laboratorios}
      podeGerenciar={can(session.role, "equipamento:gerenciar")}
      podeAlterarStatus={can(session.role, "equipamento:alterar_status")}
      topo={can(session.role, "maquina:monitorar") ? <AbasMaquinas atual="inventario" /> : undefined}
    />
  );
}
