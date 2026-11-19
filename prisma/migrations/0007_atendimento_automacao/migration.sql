-- ─────────────────────────────────────────────────────────────────────
--  0007 — Atendimento (chamados + chat), automações e notificação push
--
--  • chamados: o aluno pede ajuda pelo notebook/celular; o Líder atende.
--  • mensagens_suporte: chat de um chamado (Líder ⇄ usuário do aparelho).
--  • ações do SISTEMA: usuario_id passa a ser opcional (lembrete de devolução,
--    bloqueio no fechamento) — NULL = feita pela automação.
--  • politicas_dispositivo.bloquear_fora_horario: trava sozinho ao fechar o espaço.
--  • dispositivos.push_inscricao: inscrição Web Push do agente pelo navegador.
--  • config_sistema: chave/valor (ex.: chaves VAPID geradas na primeira vez).
-- ─────────────────────────────────────────────────────────────────────

CREATE TYPE "StatusChamado" AS ENUM ('ABERTO', 'EM_ATENDIMENTO', 'RESOLVIDO', 'CANCELADO');
CREATE TYPE "AutorMensagem" AS ENUM ('LIDER', 'USUARIO', 'SISTEMA');

CREATE TABLE "chamados" (
  "id"               TEXT PRIMARY KEY,
  "numero"           SERIAL UNIQUE,
  "descricao"        TEXT NOT NULL,
  "nome_solicitante" TEXT,
  "autoriza_tela"    BOOLEAN NOT NULL DEFAULT false,
  "status"           "StatusChamado" NOT NULL DEFAULT 'ABERTO',
  "criado_em"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "atendido_em"      TIMESTAMPTZ(3),
  "resolvido_em"     TIMESTAMPTZ(3),
  "dispositivo_id"   TEXT NOT NULL REFERENCES "dispositivos"("id") ON DELETE CASCADE,
  "atendido_por_id"  TEXT REFERENCES "usuarios"("id") ON DELETE SET NULL,
  CONSTRAINT "chamados_descricao_ck" CHECK (length(trim("descricao")) BETWEEN 3 AND 500)
);
CREATE INDEX "chamados_status_criado_idx" ON "chamados"("status", "criado_em" DESC);
CREATE INDEX "chamados_dispositivo_idx" ON "chamados"("dispositivo_id", "criado_em" DESC);
-- No máximo um chamado em aberto (aberto ou em atendimento) por aparelho
CREATE UNIQUE INDEX "chamados_um_aberto_por_dispositivo" ON "chamados"("dispositivo_id") WHERE "status" IN ('ABERTO', 'EM_ATENDIMENTO');

CREATE TABLE "mensagens_suporte" (
  "id"          TEXT PRIMARY KEY,
  "autor"       "AutorMensagem" NOT NULL,
  "autor_nome"  TEXT,
  "texto"       TEXT NOT NULL,
  "criado_em"   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "entregue_em" TIMESTAMPTZ(3),
  "chamado_id"  TEXT NOT NULL REFERENCES "chamados"("id") ON DELETE CASCADE,
  CONSTRAINT "mensagens_texto_ck" CHECK (length(trim("texto")) BETWEEN 1 AND 1000)
);
CREATE INDEX "mensagens_chamado_idx" ON "mensagens_suporte"("chamado_id", "criado_em");

ALTER TABLE "acoes_dispositivo" ALTER COLUMN "usuario_id" DROP NOT NULL;
ALTER TABLE "politicas_dispositivo" ADD COLUMN "bloquear_fora_horario" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "dispositivos" ADD COLUMN "push_inscricao" JSONB;

CREATE TABLE "config_sistema" (
  "chave"         TEXT PRIMARY KEY,
  "valor"         TEXT NOT NULL,
  "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
