import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { can, homeFor, type Permissao } from "@/lib/permissions";

/**
 * Proxy (o antigo "middleware" até o Next 15): primeira barreira de acesso.
 * A autorização definitiva é refeita em cada página e em cada rota da API.
 */
const AREAS: [prefixo: string, permissao: Permissao | null][] = [
  ["/painel", "painel:ver"],
  ["/tv", "painel:ver"],
  ["/agenda", "reserva:ver_todas"],
  ["/calibracao", "manutencao:ver"],
  ["/auditoria", "auditoria:ver"],
  ["/usuarios", "usuario:gerenciar"],
  ["/dispositivos", "dispositivo:ver"],
  ["/atendimento", "dispositivo:comandar"],
  ["/diagnostico", "dispositivo:cadastrar"],
  ["/reservas", null],
  ["/perfil", null],
  ["/equipamentos", null],
  ["/laboratorios", null],
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login" || pathname === "/cadastro") {
    return session ? NextResponse.redirect(new URL(homeFor(session.role), req.url)) : NextResponse.next();
  }

  const area = AREAS.find(([p]) => pathname === p || pathname.startsWith(`${p}/`));
  if (!area) return NextResponse.next();

  if (!session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (area[1] && !can(session.role, area[1])) {
    return NextResponse.redirect(new URL(homeFor(session.role), req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/cadastro", "/painel/:path*", "/reservas/:path*", "/agenda/:path*", "/equipamentos/:path*", "/calibracao/:path*", "/laboratorios/:path*", "/auditoria/:path*", "/usuarios/:path*", "/dispositivos/:path*", "/atendimento/:path*", "/diagnostico/:path*", "/tv/:path*", "/tv", "/perfil"],
};
