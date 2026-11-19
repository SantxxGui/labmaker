import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "@/lib/session";
import { can, homeFor, type Permissao } from "@/lib/permissions";
import { UsuarioModel } from "@/models/usuario.model";

/**
 * Lê a sessão atual (Server Components / Route Handlers).
 * Além de validar a assinatura do JWT, confere o usuário no banco a cada requisição:
 * conta desativada ou perfil trocado (sessaoVersao diferente) derruba a sessão na hora.
 * O perfil usado é sempre o do banco, nunca só o do token.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const s = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const u = await UsuarioModel.buscarSessao(s.sub);
  if (!u || !u.ativo || u.sessaoVersao !== s.v) return null;
  return { ...s, nome: u.nome, email: u.email, role: u.role };
}

/** Garante sessão (e opcionalmente uma permissão) em páginas. Redireciona se falhar. */
export async function requirePageSession(permissao?: Permissao): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (permissao && !can(session.role, permissao)) redirect(homeFor(session.role));
  return session;
}
