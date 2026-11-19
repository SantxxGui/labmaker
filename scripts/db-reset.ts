/**
 * npm run db:reset
 * Apaga as tabelas do LabMaker, aplica as migrations (prisma/migrations/*) e roda o seed.
 * Não depende do Prisma CLI — funciona em qualquer PostgreSQL (local, Supabase, RDS…).
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { seed } from "../prisma/seed";
import { explicarErro } from "./db-check";

const TABELAS = ["mensagens_suporte", "chamados", "config_sistema", "emprestimos", "tentativas_login", "eventos_dispositivo", "acoes_dispositivo", "dispositivos", "politicas_dispositivo", "comandos_remotos", "alarmes", "auditoria", "manutencoes", "agendamentos", "equipamentos", "laboratorios", "unidades", "usuarios", "_prisma_migrations"];
const TIPOS = ["StatusChamado", "AutorMensagem", "TipoDispositivo", "SistemaOperacional", "ModoDownload", "TipoAcaoDispositivo", "StatusAcao", "EstadoMaquina", "ProtocoloIndustrial", "SeveridadeAlarme", "TipoComando", "StatusComando", "Role", "TipoEquipamento", "StatusEquipamento", "Criticidade", "StatusAgendamento", "TipoManutencao"];

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Defina DATABASE_URL no arquivo .env (veja .env.example).");

  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    console.log("→ Removendo estrutura anterior…");
    for (const t of TABELAS) await db.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    for (const t of TIPOS) await db.query(`DROP TYPE IF EXISTS "${t}" CASCADE`);
    await db.query("DROP FUNCTION IF EXISTS auditoria_imutavel() CASCADE");

    const dir = join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    for (const m of migrations) {
      console.log(`→ Aplicando migration ${m}…`);
      await db.query(readFileSync(join(dir, m, "migration.sql"), "utf8"));
    }
  } finally {
    await db.end();
  }

  const demo = process.argv.includes("--demo");
  console.log(demo ? "→ Populando dados de demonstração…" : "→ Criando o espaço zerado…");
  await seed(demo ? "demo" : "zerado");
  console.log("✔ Banco pronto. Rode: npm run dev");
}

main().catch((e) => {
  console.error("✖ db:reset falhou:", explicarErro(e));
  process.exit(1);
});
