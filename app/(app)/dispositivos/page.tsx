import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AcaoDispositivoModel, DispositivoModel, EventoDispositivoModel, PoliticaModel } from "@/models/dispositivo.model";
import { EmprestimoModel } from "@/models/emprestimo.model";
import { UsuarioModel } from "@/models/usuario.model";
import { LaboratorioModel } from "@/models/laboratorio.model";
import { DispositivosView } from "@/views/dispositivos/dispositivos-view";

export const metadata: Metadata = { title: "Dispositivos" };

export default async function DispositivosPage() {
  const session = await requirePageSession("dispositivo:ver");
  const [dispositivos, laboratorios, eventos, lotes, emprestimos, alunos, politicas] = await Promise.all([
    DispositivoModel.listarPainel(),
    LaboratorioModel.listar(),
    EventoDispositivoModel.recentes(40),
    AcaoDispositivoModel.lotes(),
    EmprestimoModel.listar({ abertos: true }),
    UsuarioModel.listarAlunos(),
    PoliticaModel.listar(),
  ]);
  return (
    <DispositivosView
      inicial={dispositivos}
      laboratorios={laboratorios}
      eventosIniciais={eventos}
      lotesIniciais={lotes}
      emprestimosIniciais={emprestimos}
      alunos={alunos}
      politicas={politicas}
      podeEmprestar={can(session.role, "emprestimo:gerenciar")}
      podeCadastrar={can(session.role, "dispositivo:cadastrar")}
      podeComandar={can(session.role, "dispositivo:comandar")}
      podePoliticas={can(session.role, "dispositivo:politicas")}
    />
  );
}
