-- LabMaker — segurança (revogação de sessão, limite de login, auditoria imutável),
-- agente real nos notebooks e empréstimo de notebooks.

-- Revogação imediata de sessão
ALTER TABLE "usuarios" ADD COLUMN "sessao_versao" INTEGER NOT NULL DEFAULT 0;

-- Agente real
ALTER TABLE "dispositivos"
  ADD COLUMN "agente_real" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "agente_token_hash" TEXT,
  ADD COLUMN "telemetria" JSONB,
  ADD COLUMN "telemetria_em" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX "dispositivos_agente_token_hash_key" ON "dispositivos"("agente_token_hash");

-- Empréstimos
CREATE TABLE "emprestimos" (
    "id" TEXT NOT NULL,
    "retirado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prazo_em" TIMESTAMPTZ(3) NOT NULL,
    "devolvido_em" TIMESTAMPTZ(3),
    "observacao" TEXT,
    "dispositivo_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "tecnico_id" TEXT NOT NULL,
    "recebido_por_id" TEXT,
    CONSTRAINT "emprestimos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "emprestimos_prazo_valido" CHECK ("prazo_em" > "retirado_em"),
    CONSTRAINT "emprestimos_devolucao_valida" CHECK ("devolvido_em" IS NULL OR "devolvido_em" >= "retirado_em")
);
-- Um aparelho só pode estar emprestado uma vez por vez (garantido pelo banco, não só pelo código)
CREATE UNIQUE INDEX "emprestimos_um_aberto_por_dispositivo" ON "emprestimos"("dispositivo_id") WHERE "devolvido_em" IS NULL;
CREATE INDEX "emprestimos_dispositivo_id_retirado_em_idx" ON "emprestimos"("dispositivo_id", "retirado_em" DESC);
CREATE INDEX "emprestimos_usuario_id_idx" ON "emprestimos"("usuario_id");
CREATE INDEX "emprestimos_devolvido_em_idx" ON "emprestimos"("devolvido_em");
ALTER TABLE "emprestimos" ADD CONSTRAINT "emprestimos_dispositivo_id_fkey" FOREIGN KEY ("dispositivo_id") REFERENCES "dispositivos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emprestimos" ADD CONSTRAINT "emprestimos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emprestimos" ADD CONSTRAINT "emprestimos_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emprestimos" ADD CONSTRAINT "emprestimos_recebido_por_id_fkey" FOREIGN KEY ("recebido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tentativas de login
CREATE TABLE "tentativas_login" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "sucesso" BOOLEAN NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tentativas_login_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tentativas_login_email_criado_em_idx" ON "tentativas_login"("email", "criado_em" DESC);
CREATE INDEX "tentativas_login_ip_criado_em_idx" ON "tentativas_login"("ip", "criado_em" DESC);

-- Auditoria imutável NO BANCO: nenhum UPDATE/DELETE passa, nem vindo da aplicação.
-- Exceções: (1) o seed de demonstração, que liga a chave "labmaker.manutencao" só na própria transação;
--           (2) o ON DELETE SET NULL do autor, que só zera usuario_id e mantém o resto intacto.
CREATE OR REPLACE FUNCTION auditoria_imutavel() RETURNS trigger AS $$
BEGIN
  IF current_setting('labmaker.manutencao', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.usuario_id IS NULL AND OLD.usuario_id IS NOT NULL
     AND NEW.id = OLD.id AND NEW.criado_em = OLD.criado_em AND NEW.acao = OLD.acao
     AND NEW.entidade = OLD.entidade AND NEW.entidade_id IS NOT DISTINCT FROM OLD.entidade_id
     AND NEW.resumo = OLD.resumo AND NEW.usuario_nome = OLD.usuario_nome THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A trilha de auditoria é somente inserção (% bloqueado)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auditoria_somente_insercao
  BEFORE UPDATE OR DELETE ON "auditoria"
  FOR EACH ROW EXECUTE FUNCTION auditoria_imutavel();
