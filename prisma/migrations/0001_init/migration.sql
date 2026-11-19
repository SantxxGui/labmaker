-- LabOps — migration inicial
-- Equivale ao prisma/schema.prisma. Aplicada por `npm run db:reset` ou `prisma migrate deploy`.

-- O app grava e lê datas em UTC; fixamos o fuso do banco para evitar
-- deslocamento de horários em instalações locais (no Supabase já é o padrão).
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sem permissão para ALTER DATABASE — confira se o timezone do banco é UTC.';
END $$;

-- Enums
CREATE TYPE "Role" AS ENUM ('ADMIN', 'GESTOR', 'TECNICO', 'USUARIO', 'AUDITOR');
CREATE TYPE "TipoEquipamento" AS ENUM ('METROLOGIA', 'ENSAIO_MATERIAIS', 'ANALISE_QUIMICA', 'ELETRONICA', 'MANUFATURA_ADITIVA', 'USINAGEM_CNC', 'CORTE_LASER', 'CAMARA_CLIMATICA', 'OUTRO');
CREATE TYPE "StatusEquipamento" AS ENUM ('LIVRE', 'EM_USO', 'MANUTENCAO');
CREATE TYPE "Criticidade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');
CREATE TYPE "StatusAgendamento" AS ENUM ('CONFIRMADO', 'CANCELADO', 'CONCLUIDO');
CREATE TYPE "TipoManutencao" AS ENUM ('CALIBRACAO', 'PREVENTIVA', 'CORRETIVA');

-- Tabelas
CREATE TABLE "unidades" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "unidades_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "laboratorios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unidade_id" TEXT NOT NULL,
    CONSTRAINT "laboratorios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USUARIO',
    "matricula" TEXT,
    "cargo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "equipamentos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoEquipamento" NOT NULL,
    "fabricante" TEXT,
    "modelo" TEXT,
    "patrimonio" TEXT,
    "numero_serie" TEXT,
    "localizacao" TEXT,
    "status" "StatusEquipamento" NOT NULL DEFAULT 'LIVRE',
    "criticidade" "Criticidade" NOT NULL DEFAULT 'MEDIA',
    "duracao_slot_minutos" INTEGER NOT NULL DEFAULT 60,
    "requer_calibracao" BOOLEAN NOT NULL DEFAULT false,
    "intervalo_calibracao_dias" INTEGER,
    "proxima_calibracao_em" TIMESTAMPTZ(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "laboratorio_id" TEXT NOT NULL,
    CONSTRAINT "equipamentos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agendamentos" (
    "id" TEXT NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3) NOT NULL,
    "status" "StatusAgendamento" NOT NULL DEFAULT 'CONFIRMADO',
    "finalidade" TEXT,
    "cancelado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "equipamento_id" TEXT NOT NULL,
    CONSTRAINT "agendamentos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "manutencoes" (
    "id" TEXT NOT NULL,
    "tipo" "TipoManutencao" NOT NULL,
    "descricao" TEXT NOT NULL,
    "realizada_em" TIMESTAMPTZ(3) NOT NULL,
    "certificado" TEXT,
    "validade_ate" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equipamento_id" TEXT NOT NULL,
    "responsavel_id" TEXT NOT NULL,
    CONSTRAINT "manutencoes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auditoria" (
    "id" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT,
    "resumo" TEXT NOT NULL,
    "dados" JSONB,
    "ip" TEXT,
    "usuario_nome" TEXT NOT NULL,
    "usuario_role" "Role",
    "usuario_id" TEXT,
    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- Índices
CREATE UNIQUE INDEX "unidades_sigla_key" ON "unidades"("sigla");
CREATE UNIQUE INDEX "laboratorios_codigo_key" ON "laboratorios"("codigo");
CREATE INDEX "laboratorios_unidade_id_idx" ON "laboratorios"("unidade_id");
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");
CREATE UNIQUE INDEX "usuarios_matricula_key" ON "usuarios"("matricula");
CREATE UNIQUE INDEX "equipamentos_patrimonio_key" ON "equipamentos"("patrimonio");
CREATE INDEX "equipamentos_laboratorio_id_idx" ON "equipamentos"("laboratorio_id");
CREATE INDEX "equipamentos_status_idx" ON "equipamentos"("status");
CREATE INDEX "equipamentos_proxima_calibracao_em_idx" ON "equipamentos"("proxima_calibracao_em");
CREATE INDEX "agendamentos_equipamento_id_inicio_idx" ON "agendamentos"("equipamento_id", "inicio");
CREATE INDEX "agendamentos_usuario_id_inicio_idx" ON "agendamentos"("usuario_id", "inicio");
CREATE INDEX "agendamentos_inicio_idx" ON "agendamentos"("inicio");
CREATE INDEX "manutencoes_equipamento_id_realizada_em_idx" ON "manutencoes"("equipamento_id", "realizada_em");
CREATE INDEX "auditoria_criado_em_idx" ON "auditoria"("criado_em" DESC);
CREATE INDEX "auditoria_entidade_entidade_id_idx" ON "auditoria"("entidade", "entidade_id");
CREATE INDEX "auditoria_usuario_id_idx" ON "auditoria"("usuario_id");

-- Chaves estrangeiras
ALTER TABLE "laboratorios" ADD CONSTRAINT "laboratorios_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_laboratorio_id_fkey" FOREIGN KEY ("laboratorio_id") REFERENCES "laboratorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "manutencoes" ADD CONSTRAINT "manutencoes_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "manutencoes" ADD CONSTRAINT "manutencoes_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integridade extra (regras que o banco garante mesmo se a aplicação falhar)
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_intervalo_valido" CHECK ("fim" > "inicio");
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_slot_valido" CHECK ("duracao_slot_minutos" IN (30, 60, 90, 120));
