import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Configuração do Prisma CLI.
 * DIRECT_URL é opcional: se não existir, usa DATABASE_URL.
 * (Sem nenhuma das duas o `prisma generate` continua funcionando.)
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://localhost:5432/labops",
  },
});
