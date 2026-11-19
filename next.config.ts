import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Cabeçalhos de segurança aplicados a todas as respostas.
 * - CSP: só carrega scripts, estilos, imagens e conexões do próprio domínio
 *   ('unsafe-inline' é exigido pelo Next para a hidratação; 'unsafe-eval' só em desenvolvimento).
 * - frame-ancestors 'none' + X-Frame-Options: a aplicação não pode ser embutida em outro site (clickjacking).
 * - Permissions-Policy: o navegador nem oferece câmera, microfone ou localização para a aplicação.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'", // service worker do agente (PWA + notificações push)
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const seguranca = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: seguranca }];
  },
};

export default nextConfig;
