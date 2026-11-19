/** CONTROLLER — Gestão de usuários e perfis */
import "server-only";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { ApiError, autorizar, handler, ipDe, json } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/permissions";
import { usuarioPatchSchema } from "@/lib/validators";
import { AuditoriaModel } from "@/models/auditoria.model";
import { UsuarioModel } from "@/models/usuario.model";

type Ctx = { params: Promise<{ id: string }> };

export const UsuarioController = {
  /** GET /api/usuarios */
  listar: handler(async () => {
    await autorizar("usuario:gerenciar");
    return json({ usuarios: await UsuarioModel.listar() });
  }),

  /** PATCH /api/usuarios/:id — altera perfil ou ativa/desativa */
  atualizar: handler(async (req: Request, ctx: Ctx) => {
    const s = await autorizar("usuario:gerenciar");
    const { id } = await ctx.params;
    const dados = usuarioPatchSchema.parse(await req.json());

    const alvo = await UsuarioModel.buscarPorId(id);
    if (!alvo) throw new ApiError(404, "Usuário não encontrado.");
    if (id === s.sub) throw new ApiError(422, "Para mudar o seu próprio nome ou senha, use Meu perfil. Perfil e status da sua conta só outro Líder muda.");

    // Nunca deixar o espaço sem Líder ativo
    const deixaDeSerLider = alvo.role === "LIDER" && alvo.ativo && ((dados.role && dados.role !== "LIDER") || dados.ativo === false);
    if (deixaDeSerLider && (await UsuarioModel.contarLideresAtivos()) <= 1) {
      throw new ApiError(422, "O espaço precisa de pelo menos um Líder ativo.");
    }

    const usuario = await UsuarioModel.atualizar(id, dados);
    const mudancas = [
      dados.nome && dados.nome !== alvo.nome ? `nome "${alvo.nome}" → "${dados.nome}"` : null,
      dados.role && dados.role !== alvo.role ? `perfil ${ROLE_LABEL[alvo.role]} → ${ROLE_LABEL[dados.role]}` : null,
      dados.ativo !== undefined && dados.ativo !== alvo.ativo ? (dados.ativo ? "conta reativada" : "conta desativada") : null,
    ].filter(Boolean);
    await AuditoriaModel.registrar({
      autor: s, acao: "usuario.atualizado", entidade: "usuario", entidadeId: id, ip: ipDe(req),
      resumo: `${alvo.nome}: ${mudancas.join(", ") || "sem alterações"}`,
      dados: { de: { nome: alvo.nome, role: alvo.role, ativo: alvo.ativo }, para: dados },
    });
    return json({ usuario });
  }),

  /**
   * POST /api/usuarios/:id/senha — o Líder redefine a senha de quem esqueceu.
   * Senhas são guardadas só como hash bcrypt: ninguém consegue LER a senha de ninguém, nem o Líder.
   * Ele gera uma senha temporária (mostrada uma única vez), e as sessões abertas daquela conta caem.
   */
  redefinirSenha: handler(async (req: Request, ctx: Ctx) => {
    const s = await autorizar("usuario:gerenciar");
    const { id } = await ctx.params;
    const alvo = await UsuarioModel.buscarPorId(id);
    if (!alvo) throw new ApiError(404, "Usuário não encontrado.");
    if (id === s.sub) throw new ApiError(422, "Para trocar a sua própria senha, use Meu perfil.");

    const senhaTemporaria = gerarSenhaTemporaria();
    await UsuarioModel.redefinirSenha(id, await bcrypt.hash(senhaTemporaria, 10));
    await AuditoriaModel.registrar({
      autor: s, acao: "usuario.senha_redefinida", entidade: "usuario", entidadeId: id, ip: ipDe(req),
      resumo: `Redefiniu a senha de ${alvo.nome} (sessões abertas encerradas)`,
    });
    return json({ senhaTemporaria });
  }),
};

/** 10 caracteres sem os ambíguos (0/O, 1/l/I), fáceis de ditar no balcão: ex. "mk7-qx4-tr9" */
function gerarSenhaTemporaria() {
  const letras = "abcdefghjkmnpqrstuvwxyz23456789";
  const bloco = () => Array.from({ length: 3 }, () => letras[randomInt(letras.length)]).join("");
  return `${bloco()}-${bloco()}-${bloco()}`;
}
