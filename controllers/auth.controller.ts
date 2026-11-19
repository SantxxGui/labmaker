/** CONTROLLER — Autenticação */
import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { ApiError, autorizar, handler, ipDe, json } from "@/lib/api";
import { homeFor } from "@/lib/permissions";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { cadastroSchema, loginSchema, perfilSchema, trocarSenhaSchema } from "@/lib/validators";
import { avaliarTentativas } from "@/lib/limite-login";
import { AuditoriaModel } from "@/models/auditoria.model";
import { TentativaLoginModel } from "@/models/tentativa-login.model";
import { UsuarioModel } from "@/models/usuario.model";

// Hash fixo: iguala o tempo de resposta quando o e-mail não existe (evita enumeração de usuários)
const DUMMY_HASH = bcrypt.hashSync("labops-timing-guard", 10);

type Conta = { id: string; nome: string; email: string; role: Parameters<typeof homeFor>[0]; sessaoVersao: number };

async function abrirSessao(req: Request, u: Conta) {
  const token = await signSession({ sub: u.id, nome: u.nome, email: u.email, role: u.role, v: u.sessaoVersao });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(req));
}

export const AuthController = {
  /** POST /api/auth/login */
  login: handler(async (req: Request) => {
    const { email, senha } = loginSchema.parse(await req.json());
    const ip = ipDe(req);

    // Limite contra força bruta: por e-mail e por IP, contado no banco (vale com vários servidores)
    const limite = avaliarTentativas(await TentativaLoginModel.contarFalhas(email, ip), new Date());
    if (limite.bloqueado) {
      await AuditoriaModel.registrar({
        autor: null, acao: "auth.bloqueio_tentativas", entidade: "usuario", entidadeId: null, ip,
        resumo: `Login bloqueado para ${email}: muitas tentativas`,
      });
      throw new ApiError(429, `Muitas tentativas de login. Tente de novo em ${limite.esperaMin} min.`);
    }

    const usuario = await UsuarioModel.buscarPorEmail(email);
    const ok = await bcrypt.compare(senha, usuario?.senhaHash ?? DUMMY_HASH);
    await TentativaLoginModel.registrar(email, ip, !!usuario && ok);
    if (!usuario || !ok) throw new ApiError(401, "E-mail ou senha incorretos.");
    if (!usuario.ativo) throw new ApiError(403, "Conta desativada. Procure o Líder do espaço.");

    await abrirSessao(req, usuario);
    await AuditoriaModel.registrar({
      autor: { sub: usuario.id, nome: usuario.nome, role: usuario.role },
      acao: "auth.login", entidade: "usuario", entidadeId: usuario.id,
      resumo: `${usuario.nome} entrou no sistema`, ip: ipDe(req),
    });
    return json({ ok: true, role: usuario.role, redirectTo: homeFor(usuario.role) });
  }),

  /** POST /api/auth/cadastro — auto-cadastro sempre cria perfil USUARIO */
  cadastro: handler(async (req: Request) => {
    const dados = cadastroSchema.parse(await req.json());
    const matricula = dados.matricula || null;

    const existente = await UsuarioModel.buscarDuplicado(dados.email, matricula);
    if (existente) {
      throw new ApiError(409, existente.email === dados.email ? "Este e-mail já está cadastrado." : "Matrícula já cadastrada.");
    }

    const usuario = await UsuarioModel.criar({
      nome: dados.nome, email: dados.email, matricula, senhaHash: await bcrypt.hash(dados.senha, 10),
    });
    await abrirSessao(req, usuario);
    await AuditoriaModel.registrar({
      autor: { sub: usuario.id, nome: usuario.nome, role: usuario.role },
      acao: "auth.cadastro", entidade: "usuario", entidadeId: usuario.id,
      resumo: `${usuario.nome} criou uma conta`, ip: ipDe(req),
    });
    return json({ ok: true, redirectTo: homeFor(usuario.role) }, 201);
  }),

  /** POST /api/auth/logout */
  logout: handler(async () => {
    (await cookies()).delete(SESSION_COOKIE);
    return json({ ok: true });
  }),

  /** GET /api/auth/me — sessão atual */
  me: handler(async () => {
    const s = await autorizar();
    return json({ usuario: { id: s.sub, nome: s.nome, email: s.email, role: s.role } });
  }),

  /** GET /api/auth/perfil — dados da própria conta (página Meu perfil) */
  perfil: handler(async () => {
    const s = await autorizar();
    const usuario = await UsuarioModel.perfil(s.sub);
    if (!usuario) throw new ApiError(404, "Conta não encontrada.");
    return json({ usuario });
  }),

  /** PATCH /api/auth/perfil — qualquer pessoa muda o próprio nome (aparece na hora, sem novo login) */
  atualizarPerfil: handler(async (req: Request) => {
    const s = await autorizar();
    const { nome } = perfilSchema.parse(await req.json());
    const antes = s.nome;
    const usuario = await UsuarioModel.renomear(s.sub, nome);
    if (antes !== nome) {
      await AuditoriaModel.registrar({
        autor: { ...s, nome }, acao: "usuario.perfil", entidade: "usuario", entidadeId: s.sub, ip: ipDe(req),
        resumo: `Mudou o próprio nome: "${antes}" → "${nome}"`,
      });
    }
    return json({ usuario });
  }),

  /**
   * POST /api/auth/senha — a própria pessoa troca a senha.
   * Pede a senha atual (sessão esquecida aberta não basta), conta erro no mesmo limite do login,
   * derruba as outras sessões da conta e renova a sessão de quem trocou.
   */
  trocarSenha: handler(async (req: Request) => {
    const s = await autorizar();
    const { senhaAtual, novaSenha } = trocarSenhaSchema.parse(await req.json());
    const ip = ipDe(req);
    const limite = avaliarTentativas(await TentativaLoginModel.contarFalhas(s.email, ip), new Date());
    if (limite.bloqueado) throw new ApiError(429, `Muitas tentativas. Tente de novo em ${limite.esperaMin} min.`);

    const conta = await UsuarioModel.buscarPorId(s.sub);
    const ok = !!conta && (await bcrypt.compare(senhaAtual, conta.senhaHash));
    if (!ok) {
      await TentativaLoginModel.registrar(s.email, ip, false);
      throw new ApiError(400, "Senha atual incorreta.");
    }
    const atualizado = await UsuarioModel.trocarSenha(s.sub, await bcrypt.hash(novaSenha, 10));
    await abrirSessao(req, atualizado);
    await AuditoriaModel.registrar({
      autor: s, acao: "usuario.senha_trocada", entidade: "usuario", entidadeId: s.sub, ip,
      resumo: `${s.nome} trocou a própria senha (outras sessões encerradas)`,
    });
    return json({ ok: true });
  }),
};
