/**
 * npm run db:check
 * Testa a conexão com o banco e explica, em português, o que está errado.
 */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import pg from "pg";

export function explicarErro(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/password authentication failed|AuthenticationFailed|28P01/i.test(msg))
    return `${msg}\n  → Senha do banco incorreta na DATABASE_URL. No Supabase: Project Settings → Database → Reset database password (use só letras e números).`;
  if (/tenant\/user .* not found|Tenant or user not found/i.test(msg))
    return `${msg}\n  → A URL aponta para a região errada ou o usuário está sem o código do projeto. Copie a URL inteira em Supabase → Connect → Session pooler.`;
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) return `${msg}\n  → Endereço do banco não encontrado. Confira o host da DATABASE_URL e a sua internet.`;
  if (/ECONNREFUSED|ETIMEDOUT/i.test(msg)) return `${msg}\n  → O banco não respondeu. Use a URL do "Session pooler" (porta 5432) em vez da conexão direta.`;
  if (/Defina DATABASE_URL/i.test(msg)) return `${msg}\n  → Crie o arquivo .env na raiz do projeto (mesma pasta do package.json).`;
  return msg;
}

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Defina DATABASE_URL no arquivo .env (veja .env.example).");
  const { hostname: host, port, pathname, username } = new URL(url);
  console.log(`→ Conectando em ${host}:${port || 5432}${pathname} como ${username}…`);

  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const { rows } = await db.query(
      `SELECT current_setting('TimeZone') AS fuso, version() AS versao,
              (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN
                ('usuarios','unidades','laboratorios','equipamentos','agendamentos','manutencoes','auditoria','alarmes','comandos_remotos','politicas_dispositivo','dispositivos','acoes_dispositivo','eventos_dispositivo','emprestimos','tentativas_login','chamados','mensagens_suporte','config_sistema')) AS tabelas`,
    );
    const { fuso, versao, tabelas } = rows[0];
    console.log(`✔ Conectou — ${String(versao).split(",")[0]} · fuso ${fuso}`);
    console.log(tabelas === 18 ? "✔ As 18 tabelas do LabMaker existem." : `! Encontradas ${tabelas}/18 tabelas — rode: npm run db:reset`);
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("✖ Falha:", explicarErro(e));
    process.exit(1);
  });
}
