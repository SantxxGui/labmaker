import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AcaoDispositivoModel, DispositivoModel, EventoDispositivoModel, PoliticaModel } from "@/models/dispositivo.model";
import { EmprestimoModel } from "@/models/emprestimo.model";
import { DispositivoDetalheView } from "@/views/dispositivos/dispositivo-detalhe-view";

export const metadata: Metadata = { title: "Dispositivo" };

export default async function DispositivoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession("dispositivo:ver");
  const { id } = await params;
  const dispositivo = await DispositivoModel.buscarPainel(id);
  if (!dispositivo) notFound();
  const [acoes, eventos, politicas, emprestimos] = await Promise.all([
    AcaoDispositivoModel.listar(id),
    EventoDispositivoModel.recentes(30, id),
    PoliticaModel.listar(),
    EmprestimoModel.listar({ dispositivoId: id, limit: 10 }),
  ]);
  return (
    <DispositivoDetalheView
      key={id}
      inicial={dispositivo}
      acoesIniciais={acoes}
      eventosIniciais={eventos}
      emprestimos={emprestimos}
      politica={politicas.find((p) => p.id === dispositivo.politica?.id) ?? null}
      podeComandar={can(session.role, "dispositivo:comandar")}
      podeApagar={can(session.role, "dispositivo:apagar")}
    />
  );
}
