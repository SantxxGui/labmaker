/** CONTROLLER — Calibrações e manutenções */
import "server-only";
import { ApiError, autorizar, handler, ipDe, json } from "@/lib/api";
import { MANUTENCAO_LABEL } from "@/lib/labels";
import { LAB } from "@/lib/slots";
import { manutencaoCreateSchema } from "@/lib/validators";
import { AuditoriaModel } from "@/models/auditoria.model";
import { EquipamentoModel } from "@/models/equipamento.model";
import { ManutencaoModel } from "@/models/manutencao.model";

const meioDia = (data: string) => new Date(`${data}T12:00:00${LAB.utcOffset}`);
const fimDoDia = (data: string) => new Date(`${data}T23:59:59${LAB.utcOffset}`);

export const ManutencaoController = {
  /** GET /api/manutencoes?equipamentoId= */
  listar: handler(async (req: Request) => {
    await autorizar("manutencao:ver");
    const equipamentoId = new URL(req.url).searchParams.get("equipamentoId") ?? undefined;
    return json({ manutencoes: await ManutencaoModel.listarRecentes(50, equipamentoId) });
  }),

  /** POST /api/manutencoes — registra o serviço e atualiza o equipamento */
  registrar: handler(async (req: Request) => {
    const s = await autorizar("manutencao:registrar");
    const d = manutencaoCreateSchema.parse(await req.json());

    const e = await EquipamentoModel.buscarAtivo(d.equipamentoId);
    if (!e) throw new ApiError(404, "Equipamento não encontrado.");

    // Calibração: validade informada OU calculada pelo intervalo cadastrado no equipamento
    let validadeAte: Date | null = d.validadeAte ? fimDoDia(d.validadeAte) : null;
    if (d.tipo === "CALIBRACAO" && !validadeAte) {
      if (!e.intervaloCalibracaoDias) {
        throw new ApiError(422, "Informe a validade da calibração (o equipamento não tem intervalo cadastrado).");
      }
      validadeAte = new Date(fimDoDia(d.realizadaEm).getTime() + e.intervaloCalibracaoDias * 86_400_000);
    }

    const manutencao = await ManutencaoModel.registrar({
      equipamentoId: d.equipamentoId, responsavelId: s.sub, tipo: d.tipo, descricao: d.descricao,
      realizadaEm: meioDia(d.realizadaEm), certificado: d.certificado || null, validadeAte,
      liberar: d.liberarEquipamento,
    });
    await AuditoriaModel.registrar({
      autor: s, entidade: "equipamento", entidadeId: e.id, ip: ipDe(req),
      acao: d.tipo === "CALIBRACAO" ? "calibracao.registrada" : "manutencao.registrada",
      resumo: `${MANUTENCAO_LABEL[d.tipo]} registrada em ${e.nome}${d.certificado ? ` (cert. ${d.certificado})` : ""}`,
      dados: { tipo: d.tipo, validadeAte: validadeAte?.toISOString() ?? null, liberou: d.liberarEquipamento },
    });
    return json({ manutencao, proximaCalibracaoEm: d.tipo === "CALIBRACAO" ? validadeAte?.toISOString() : undefined }, 201);
  }),
};
