/** CONTROLLER — Empréstimo e devolução de notebooks/tablets do espaço */
import "server-only";
import { avaliarEmprestimo } from "@/lib/emprestimo";
import { ApiError, autorizar, handler, ipDe, json } from "@/lib/api";
import { devolucaoSchema, emprestimoSchema } from "@/lib/validators";
import { AuditoriaModel } from "@/models/auditoria.model";
import { EmprestimoModel } from "@/models/emprestimo.model";

type Ctx = { params: Promise<{ id: string }> };
const hora = (d: Date | string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(d));

export const EmprestimoController = {
  /** GET /api/emprestimos?situacao=abertos|todos */
  listar: handler(async (req: Request) => {
    await autorizar("dispositivo:ver");
    const abertos = new URL(req.url).searchParams.get("situacao") !== "todos";
    return json({ emprestimos: await EmprestimoModel.listar({ abertos }) }, { headers: { "Cache-Control": "no-store" } });
  }),

  /** GET /api/emprestimos/meus — o aluno vê o aparelho que está com ele */
  meus: handler(async () => {
    const s = await autorizar();
    return json({ emprestimos: await EmprestimoModel.listar({ usuarioId: s.sub, abertos: true }) });
  }),

  /** POST /api/emprestimos — empresta um aparelho a um aluno */
  criar: handler(async (req: Request) => {
    const s = await autorizar("emprestimo:gerenciar");
    const d = emprestimoSchema.parse(await req.json());
    const ctx = await EmprestimoModel.contexto(d.dispositivoId, d.usuarioId);
    if (!ctx.dispositivo) throw new ApiError(404, "Dispositivo não encontrado.");
    if (!ctx.aluno) throw new ApiError(404, "Aluno não encontrado.");

    const regra = avaliarEmprestimo({
      dispositivo: { ...ctx.dispositivo, emprestado: ctx.emprestado },
      aluno: { ativo: ctx.aluno.ativo, abertos: ctx.abertosAluno },
      prazoEm: d.prazoEm,
    });
    if (!regra.ok) throw new ApiError(409, regra.motivo);

    let emprestimo;
    try {
      emprestimo = await EmprestimoModel.criar({ ...d, tecnicoId: s.sub, observacao: d.observacao || null });
    } catch (e) {
      // Dois Líderes emprestando o mesmo aparelho ao mesmo tempo: o índice único do banco segura o segundo
      if ((e as { code?: string }).code === "P2002") throw new ApiError(409, "Este aparelho acabou de ser emprestado por outra pessoa.");
      throw e;
    }
    await AuditoriaModel.registrar({
      autor: s, acao: "emprestimo.criado", entidade: "emprestimo", entidadeId: emprestimo.id, ip: ipDe(req),
      resumo: `Emprestou ${ctx.dispositivo.hostname} para ${ctx.aluno.nome} até ${hora(d.prazoEm)}`,
    });
    return json({ emprestimo }, 201);
  }),

  /** POST /api/emprestimos/:id/devolver */
  devolver: handler(async (req: Request, ctx: Ctx) => {
    const s = await autorizar("emprestimo:gerenciar");
    const { id } = await ctx.params;
    const { observacao } = devolucaoSchema.parse(await req.json().catch(() => ({})));
    const aberto = await EmprestimoModel.buscarAberto(id);
    if (!aberto) throw new ApiError(404, "Empréstimo não encontrado ou já devolvido.");

    const emprestimo = await EmprestimoModel.devolver(id, s.sub, observacao || null);
    const atraso = emprestimo.devolvidoEm && new Date(emprestimo.devolvidoEm) > new Date(aberto.prazoEm);
    await AuditoriaModel.registrar({
      autor: s, acao: "emprestimo.devolvido", entidade: "emprestimo", entidadeId: id, ip: ipDe(req),
      resumo: `Recebeu ${aberto.dispositivo.hostname} de ${aberto.usuario.nome}${atraso ? " (com atraso)" : ""}${observacao ? ` — ${observacao}` : ""}`,
    });
    return json({ emprestimo });
  }),
};
