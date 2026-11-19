-- Automações (lembrete, atraso, fechamento, abertura) são criadas por dois caminhos: o check-in
-- do aparelho e o agendador do servidor. O índice garante, no banco, uma única ação por
-- aparelho e marcador ("auto:lembrete:<empréstimo>", "auto:fechamento:<data>"…), mesmo se os
-- dois rodarem no mesmo instante.
CREATE UNIQUE INDEX "acoes_automaticas_unicas"
  ON "acoes_dispositivo" ("dispositivo_id", "parametro")
  WHERE "parametro" LIKE 'auto:%';
