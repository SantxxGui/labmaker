/**
 * Prepara o banco só se ele estiver vazio — usado pelo docker-compose e no primeiro deploy.
 * Diferente do db:reset, NUNCA apaga dados existentes.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import pg from "pg";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Defina DATABASE_URL");
  for (let tentativa = 1; ; tentativa++) {
    const db = new pg.Client({ connectionString: url });
    try {
      await db.connect();
      const { rows } = await db.query("SELECT to_regclass('public.usuarios') IS NOT NULL AS existe");
      await db.end();
      if (rows[0].existe) return console.log("✔ Banco já preparado — nada a fazer.");
      break;
    } catch (e) {
      await db.end().catch(() => {});
      // Senha ou usuário errado não se resolve esperando — e insistir faz o Supabase bloquear novas
      // conexões por alguns minutos (ECIRCUITBREAKER). Para na hora, com a explicação.
      const err = e as { code?: string; message?: string };
      if (err.code === "28P01" || err.code === "28000" || /password authentication|authentication failures|ECIRCUITBREAKER|Tenant or user not found/i.test(err.message ?? "")) {
        throw new Error(`${err.message}\n  → Usuário ou senha da DATABASE_URL errados. No Supabase use Connect → Session pooler (usuário "postgres.SEU_PROJETO") e a senha do banco; caracteres especiais na senha precisam de código (@ = %40, # = %23). Se apareceu "too many authentication failures", espere uns 5 minutos depois de corrigir.`);
      }
      if (err.message?.includes("ENETUNREACH")) {
        throw new Error(`${err.message}\n  → Endereço só IPv6: use a URL do "Session pooler" do Supabase (…pooler.supabase.com), não a "Direct connection".`);
      }
      if (tentativa >= 20) throw e;
      console.log(`… aguardando o PostgreSQL (${tentativa})`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  console.log("→ Banco vazio: aplicando migrations e criando o espaço…");
  const r = spawnSync("npx", ["tsx", "scripts/db-reset.ts", ...(process.argv.includes("--demo") ? ["--demo"] : [])], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

main().catch((e) => { console.error("✖ db:setup:", e.message); process.exit(1); });
