/** Gera docs/API.md a partir de lib/openapi.ts — `npm run docs:api`. A doc nunca diverge do código. */
import { writeFileSync } from "node:fs";
import { ROTAS, gerarOpenApi } from "../lib/openapi";

const spec = gerarOpenApi();
const linhas: string[] = [
  "# API REST",
  "",
  "> Gerado por `npm run docs:api` a partir de `lib/openapi.ts`. Versão navegável e testável em **`/api-docs`**; especificação OpenAPI 3.1 em **`/api/openapi.json`**.",
  "",
  `**${ROTAS.length} operações.** JSON em UTF-8. Erros sempre como \`{ "error": "mensagem em português" }\`.`,
  "",
  "| Código | Quando |",
  "|---|---|",
  "| 401 | Sem sessão (ou sessão revogada: conta bloqueada, perfil ou senha alterados) |",
  "| 403 | Perfil sem a permissão |",
  "| 404 | Registro não encontrado |",
  "| 409 | Conflito: horário ocupado, aparelho já emprestado, duplicidade |",
  "| 422 | Dados inválidos (Zod) ou regra de negócio violada |",
  "| 429 | Muitas tentativas de login |",
  "",
  "Autenticação: cookie `labops_session` (JWT httpOnly) obtido em `POST /api/auth/login`. O agente usa `Authorization: Bearer lmk_…`.",
  "",
];
for (const { name: tag } of spec.tags) {
  const ops = ROTAS.filter(([, , o]) => o.tag === tag);
  if (!ops.length) continue;
  linhas.push(`## ${tag}`, "", "| Método | Rota | O que faz | Acesso |", "|---|---|---|---|");
  for (const [m, c, o] of ops) {
    const acesso = o.publico ? "público" : o.agente ? "token do agente" : o.perm ? `\`${o.perm}\`` : "logado";
    linhas.push(`| \`${m.toUpperCase()}\` | \`${c}\` | ${o.resumo} | ${acesso} |`);
  }
  linhas.push("");
}
linhas.push(
  "## Testando pelo terminal",
  "",
  "```bash",
  "B=http://localhost:3000",
  "curl -c c.txt -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"lider@labmaker.dev\",\"senha\":\"labmaker123\"}'",
  "curl -b c.txt $B/api/equipamentos",
  "npm run test:api           # 105 verificações ponta a ponta",
  "npm run test:concorrencia  # 50 pedidos simultâneos → 1 reserva",
  "```",
  "",
);
writeFileSync("docs/API.md", linhas.join("\n"));
console.log(`✔ docs/API.md — ${ROTAS.length} operações`);
