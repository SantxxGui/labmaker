-- LabOps — gestão de dispositivos de TI (notebooks, desktops, tablets, celulares)

CREATE TYPE "TipoDispositivo" AS ENUM ('NOTEBOOK', 'DESKTOP', 'TABLET', 'SMARTPHONE');
CREATE TYPE "SistemaOperacional" AS ENUM ('WINDOWS', 'MACOS', 'LINUX', 'ANDROID', 'IOS', 'CHROMEOS');
CREATE TYPE "ModoDownload" AS ENUM ('LIVRE', 'BLOQUEAR_EXECUTAVEIS', 'SOMENTE_APROVADOS');
CREATE TYPE "TipoAcaoDispositivo" AS ENUM ('ALERTA', 'BLOQUEAR', 'DESBLOQUEAR', 'REINICIAR', 'INSTALAR_APP', 'REMOVER_APP', 'SESSAO_REMOTA', 'SINCRONIZAR', 'APAGAR_DADOS');
CREATE TYPE "StatusAcao" AS ENUM ('PENDENTE', 'ENTREGUE', 'EXECUTADA', 'RECUSADA');

CREATE TABLE "politicas_dispositivo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "bloquear_usb" BOOLEAN NOT NULL DEFAULT true,
    "modo_download" "ModoDownload" NOT NULL DEFAULT 'BLOQUEAR_EXECUTAVEIS',
    "sites_bloqueados" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "apps_bloqueados" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "exigir_criptografia" BOOLEAN NOT NULL DEFAULT true,
    "bloqueio_tela_minutos" INTEGER NOT NULL DEFAULT 10,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "politicas_dispositivo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "politicas_bloqueio_tela_valido" CHECK ("bloqueio_tela_minutos" BETWEEN 1 AND 120)
);

CREATE TABLE "dispositivos" (
    "id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "tipo" "TipoDispositivo" NOT NULL,
    "so" "SistemaOperacional" NOT NULL,
    "versao_so" TEXT NOT NULL,
    "fabricante" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "numero_serie" TEXT NOT NULL,
    "endereco_ip" TEXT,
    "endereco_mac" TEXT,
    "agente_versao" TEXT NOT NULL,
    "criptografado" BOOLEAN NOT NULL DEFAULT false,
    "antivirus_ativo" BOOLEAN NOT NULL DEFAULT true,
    "firewall_ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizacoes_pendentes" INTEGER NOT NULL DEFAULT 0,
    "armazenamento_gb" INTEGER NOT NULL,
    "bloqueado" BOOLEAN NOT NULL DEFAULT false,
    "apps_instalados" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "ultimo_contato_em" TIMESTAMPTZ(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsavel_id" TEXT,
    "laboratorio_id" TEXT,
    "politica_id" TEXT,
    CONSTRAINT "dispositivos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dispositivos_atualizacoes_validas" CHECK ("atualizacoes_pendentes" >= 0)
);

CREATE TABLE "acoes_dispositivo" (
    "id" TEXT NOT NULL,
    "tipo" "TipoAcaoDispositivo" NOT NULL,
    "status" "StatusAcao" NOT NULL DEFAULT 'PENDENTE',
    "lote" TEXT,
    "titulo" TEXT,
    "mensagem" TEXT,
    "prioridade" "SeveridadeAlarme",
    "parametro" TEXT,
    "justificativa" TEXT,
    "motivo" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluido_em" TIMESTAMPTZ(3),
    "dispositivo_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    CONSTRAINT "acoes_dispositivo_pkey" PRIMARY KEY ("id"),
    -- alerta precisa de título e mensagem
    CONSTRAINT "acoes_alerta_completo" CHECK ("tipo" <> 'ALERTA' OR ("titulo" IS NOT NULL AND "mensagem" IS NOT NULL))
);

CREATE TABLE "eventos_dispositivo" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "severidade" "SeveridadeAlarme" NOT NULL DEFAULT 'INFO',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispositivo_id" TEXT NOT NULL,
    CONSTRAINT "eventos_dispositivo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "politicas_dispositivo_nome_key" ON "politicas_dispositivo"("nome");
CREATE UNIQUE INDEX "dispositivos_hostname_key" ON "dispositivos"("hostname");
CREATE UNIQUE INDEX "dispositivos_numero_serie_key" ON "dispositivos"("numero_serie");
CREATE UNIQUE INDEX "dispositivos_endereco_mac_key" ON "dispositivos"("endereco_mac");
CREATE INDEX "dispositivos_laboratorio_id_idx" ON "dispositivos"("laboratorio_id");
CREATE INDEX "dispositivos_responsavel_id_idx" ON "dispositivos"("responsavel_id");
CREATE INDEX "acoes_dispositivo_dispositivo_id_criado_em_idx" ON "acoes_dispositivo"("dispositivo_id", "criado_em" DESC);
CREATE INDEX "acoes_dispositivo_lote_idx" ON "acoes_dispositivo"("lote");
CREATE INDEX "eventos_dispositivo_criado_em_idx" ON "eventos_dispositivo"("criado_em" DESC);
CREATE INDEX "eventos_dispositivo_dispositivo_id_criado_em_idx" ON "eventos_dispositivo"("dispositivo_id", "criado_em" DESC);

ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_laboratorio_id_fkey" FOREIGN KEY ("laboratorio_id") REFERENCES "laboratorios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_politica_id_fkey" FOREIGN KEY ("politica_id") REFERENCES "politicas_dispositivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "acoes_dispositivo" ADD CONSTRAINT "acoes_dispositivo_dispositivo_id_fkey" FOREIGN KEY ("dispositivo_id") REFERENCES "dispositivos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "acoes_dispositivo" ADD CONSTRAINT "acoes_dispositivo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "eventos_dispositivo" ADD CONSTRAINT "eventos_dispositivo_dispositivo_id_fkey" FOREIGN KEY ("dispositivo_id") REFERENCES "dispositivos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
