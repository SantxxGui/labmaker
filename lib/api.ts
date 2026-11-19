import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSession } from "@/lib/auth";
import { can, type Permissao } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/session";

/** Erro de negócio com status HTTP — vira `{ "error": "..." }` na resposta. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json<T>(data: T, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

/** Exige sessão (401) e, se informada, a permissão (403). */
export async function autorizar(permissao?: Permissao): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new ApiError(401, "Não autenticado.");
  if (permissao && !can(session.role, permissao)) {
    throw new ApiError(403, "Seu perfil não tem permissão para esta ação.");
  }
  return session;
}

export function ipDe(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

/** Envolve uma action de controller e converte erros em respostas JSON consistentes. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return json({ error: err.message }, err.status);
      if (err instanceof ZodError) return json({ error: err.issues[0]?.message ?? "Dados inválidos." }, 422);
      if (err instanceof SyntaxError) return json({ error: "JSON inválido no corpo da requisição." }, 400);
      console.error("[api]", err);
      return json({ error: "Erro interno. Tente novamente." }, 500);
    }
  };
}
