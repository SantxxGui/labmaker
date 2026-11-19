import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AgendamentoModel } from "@/models/agendamento.model";
import { EquipamentoModel } from "@/models/equipamento.model";
import { LaboratorioModel } from "@/models/laboratorio.model";
import { EmprestimoModel } from "@/models/emprestimo.model";
import { MeuEmprestimo } from "@/views/reservas/meu-emprestimo";
import { AgendamentoPanel } from "@/views/reservas/agendamento-panel";

export const metadata: Metadata = { title: "Reservar" };

export default async function ReservasPage() {
  const session = await requirePageSession();
  const [equipamentos, laboratorios, reservas, emprestimos] = await Promise.all(
    [
      EquipamentoModel.listarAtivos(),
      LaboratorioModel.listar(),
      AgendamentoModel.listarDoUsuario(session.sub),
      EmprestimoModel.listar({ usuarioId: session.sub, abertos: true }),
    ],
  );
  return (
    <div className="space-y-6">
      <MeuEmprestimo emprestimos={emprestimos} />
      <AgendamentoPanel
        equipamentos={equipamentos}
        laboratorios={laboratorios}
        initialReservas={reservas}
        podeReservar={can(session.role, "reserva:criar")}
      />
    </div>
  );
}
