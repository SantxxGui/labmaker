/**
 * Sessão via JWT assinado (HS256) em cookie httpOnly.
 * Este módulo NÃO importa Prisma — é seguro para o proxy.ts.
 */
import { SignJWT, jwtVerify } from "jose";
import { ROLES, type Role } from "@/lib/permissions";

export const SESSION_COOKIE = "labops_session";
export const SESSION_MAX_AGE = 60 * 60 * 8; // 8 horas (um turno de trabalho)

export type SessionPayload = {
  sub: string; // id do usuário
  nome: string;
  email: string;
  role: Role;
  /** versão da sessão do usuário no banco — se mudar, o token deixa de valer (revogação) */
  v: number;
};

const DEV_SECRET = "labops-dev-only-secret-nao-usar-em-producao!";
let avisou = false;

function getSecret() {
  let secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET ausente ou curto demais (mínimo 32 caracteres).");
    }
    if (!avisou) {
      console.warn("[labops] AUTH_SECRET não definido — usando chave de desenvolvimento.");
      avisou = true;
    }
    secret = DEV_SECRET;
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT({ nome: payload.nome, email: payload.email, role: payload.role, v: payload.v })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const role = payload.role as Role;
    if (!payload.sub || !ROLES.includes(role)) return null;
    return { sub: payload.sub, nome: String(payload.nome ?? ""), email: String(payload.email ?? ""), role, v: Number(payload.v ?? 0) };
  } catch {
    return null;
  }
}

/**
 * Opções do cookie de sessão. `Secure` acompanha a conexão: HTTPS (direto ou atrás de proxy/túnel,
 * via X-Forwarded-Proto) → cookie só trafega cifrado; HTTP na rede local (demonstração em
 * http://IP:3000) → o navegador recusaria um cookie Secure e o login falharia sem aviso.
 * COOKIE_SECURE=true força sempre Secure (produção atrás de HTTPS).
 */
export function sessionCookieOptions(req: Request) {
  const https = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https" || new URL(req.url).protocol === "https:";
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true" || https,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

/**
 * Código de inscrição de um computador (JWT de 2 h, assinado com a mesma chave).
 * É o que o Líder gera na tela e cola no comando do agente; vale para inscrever, não para logar.
 */
export async function assinarInscricao(dados: { politicaId: string | null; laboratorioId: string | null; por: string }) {
  return new SignJWT({ ...dados, fim: "inscricao-agente" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(getSecret());
}

export async function verificarInscricao(codigo: string) {
  try {
    const { payload } = await jwtVerify(codigo, getSecret(), { algorithms: ["HS256"] });
    if (payload.fim !== "inscricao-agente") return null;
    return { politicaId: (payload.politicaId as string | null) ?? null, laboratorioId: (payload.laboratorioId as string | null) ?? null, por: String(payload.por ?? "") };
  } catch {
    return null;
  }
}
