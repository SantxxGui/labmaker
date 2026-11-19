/** CONTROLLER — Unidades e laboratórios */
import "server-only";
import { ApiError, autorizar, handler, ipDe, json } from "@/lib/api";
import { laboratorioCreateSchema } from "@/lib/validators";
import { AuditoriaModel } from "@/models/auditoria.model";
import { LaboratorioModel } from "@/models/laboratorio.model";

export const LaboratorioController = {
  /** GET /api/laboratorios */
  listar: handler(async () => {
    await autorizar("equipamento:ver");
    const [laboratorios, unidades] = await Promise.all([LaboratorioModel.listar(), LaboratorioModel.listarUnidades()]);
    return json({ laboratorios, unidades });
  }),

  /** POST /api/laboratorios */
  criar: handler(async (req: Request) => {
    const s = await autorizar("laboratorio:gerenciar");
    const d = laboratorioCreateSchema.parse(await req.json());
    if (!(await LaboratorioModel.buscarUnidade(d.unidadeId))) throw new ApiError(404, "Unidade não encontrada.");
    if (await LaboratorioModel.buscarPorCodigo(d.codigo)) throw new ApiError(409, "Já existe um laboratório com este código.");

    const laboratorio = await LaboratorioModel.criar({
      nome: d.nome, codigo: d.codigo, unidadeId: d.unidadeId, descricao: d.descricao || null,
    });
    await AuditoriaModel.registrar({
      autor: s, acao: "laboratorio.criado", entidade: "laboratorio", entidadeId: laboratorio.id,
      resumo: `Criou a área ${laboratorio.codigo} — ${laboratorio.nome}`, ip: ipDe(req),
    });
    return json({ laboratorio }, 201);
  }),
};
