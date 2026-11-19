-- LabOps — conectividade industrial: telemetria, alarmes e comandos remotos

CREATE TYPE "EstadoMaquina" AS ENUM ('OPERANDO', 'OCIOSO', 'PAUSADO', 'ALARME', 'OFFLINE');
CREATE TYPE "ProtocoloIndustrial" AS ENUM ('OPC_UA', 'MTCONNECT', 'MODBUS_TCP', 'MQTT', 'SCPI');
CREATE TYPE "SeveridadeAlarme" AS ENUM ('INFO', 'AVISO', 'CRITICO');
CREATE TYPE "TipoComando" AS ENUM ('PAUSAR', 'RETOMAR', 'PARAR_CICLO', 'RECONHECER_ALARMES');
CREATE TYPE "StatusComando" AS ENUM ('EXECUTADO', 'REJEITADO');

ALTER TABLE "equipamentos"
  ADD COLUMN "endereco_ip" TEXT,
  ADD COLUMN "protocolo" "ProtocoloIndustrial",
  ADD COLUMN "firmware" TEXT,
  ADD COLUMN "camera_url" TEXT,
  ADD COLUMN "estado_maquina" "EstadoMaquina" NOT NULL DEFAULT 'OCIOSO',
  ADD COLUMN "ultimo_contato_em" TIMESTAMPTZ(3);

-- Um IP não pode estar em duas máquinas ativas
CREATE UNIQUE INDEX "equipamentos_endereco_ip_ativo_key" ON "equipamentos"("endereco_ip") WHERE "ativo" AND "endereco_ip" IS NOT NULL;

CREATE TABLE "alarmes" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "severidade" "SeveridadeAlarme" NOT NULL,
    "ativo_desde" TIMESTAMPTZ(3) NOT NULL,
    "encerrado_em" TIMESTAMPTZ(3),
    "reconhecido_em" TIMESTAMPTZ(3),
    "equipamento_id" TEXT NOT NULL,
    "reconhecido_por_id" TEXT,
    CONSTRAINT "alarmes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "alarmes_periodo_valido" CHECK ("encerrado_em" IS NULL OR "encerrado_em" >= "ativo_desde")
);

CREATE TABLE "comandos_remotos" (
    "id" TEXT NOT NULL,
    "tipo" "TipoComando" NOT NULL,
    "status" "StatusComando" NOT NULL,
    "motivo" TEXT,
    "justificativa" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equipamento_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    CONSTRAINT "comandos_remotos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "alarmes_equipamento_id_ativo_desde_idx" ON "alarmes"("equipamento_id", "ativo_desde" DESC);
CREATE INDEX "alarmes_encerrado_em_idx" ON "alarmes"("encerrado_em");
CREATE INDEX "comandos_remotos_equipamento_id_criado_em_idx" ON "comandos_remotos"("equipamento_id", "criado_em" DESC);

ALTER TABLE "alarmes" ADD CONSTRAINT "alarmes_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alarmes" ADD CONSTRAINT "alarmes_reconhecido_por_id_fkey" FOREIGN KEY ("reconhecido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "comandos_remotos" ADD CONSTRAINT "comandos_remotos_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comandos_remotos" ADD CONSTRAINT "comandos_remotos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
