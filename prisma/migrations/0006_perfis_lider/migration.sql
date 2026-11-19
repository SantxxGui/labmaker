-- ─────────────────────────────────────────────────────────────────────
--  0006 — Perfis do LabMaker: Líder, Professor(a) e Aluno(a)
--
--  O espaço não tem Coordenação nem Auditoria separadas: o Líder
--  (OED — Orientador Educacional Digital — ou Estagiário EMK) cuida de tudo.
--  Conversão dos dados existentes:
--    TECNICO → LIDER · ADMIN → LIDER · AUDITOR → USUARIO (só consultava)
--  A trilha de auditoria continua imutável (gatilho da 0005): ALTER TABLE
--  não dispara gatilhos de linha, então o histórico só troca o nome do perfil.
-- ─────────────────────────────────────────────────────────────────────

CREATE TYPE "Role_novo" AS ENUM ('LIDER', 'GESTOR', 'USUARIO');

ALTER TABLE "usuarios" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "usuarios" ALTER COLUMN "role" TYPE "Role_novo" USING (
  CASE "role"::text WHEN 'TECNICO' THEN 'LIDER' WHEN 'ADMIN' THEN 'LIDER' WHEN 'AUDITOR' THEN 'USUARIO' ELSE "role"::text END
)::"Role_novo";
ALTER TABLE "usuarios" ALTER COLUMN "role" SET DEFAULT 'USUARIO';

ALTER TABLE "auditoria" ALTER COLUMN "usuario_role" TYPE "Role_novo" USING (
  CASE "usuario_role"::text WHEN 'TECNICO' THEN 'LIDER' WHEN 'ADMIN' THEN 'LIDER' WHEN 'AUDITOR' THEN 'USUARIO' ELSE "usuario_role"::text END
)::"Role_novo";

DROP TYPE "Role";
ALTER TYPE "Role_novo" RENAME TO "Role";
