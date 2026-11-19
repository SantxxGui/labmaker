import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * GET /api/agente/script — baixa o agente (agente/agente.mjs) direto do servidor.
 * Na VM ou em outro computador: curl -o agente.mjs http://SERVIDOR:3000/api/agente/script
 * Público como o próprio arquivo do repositório: ele não contém segredo; o que dá acesso é o código de inscrição.
 */
export async function GET() {
  const codigo = await readFile(path.join(process.cwd(), "agente", "agente.mjs"), "utf8");
  return new Response(codigo, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Content-Disposition": 'attachment; filename="agente.mjs"',
      "Cache-Control": "no-store",
    },
  });
}
