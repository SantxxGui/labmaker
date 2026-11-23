/**
 * MODEL — Convite de instalação do agente (código curto → código de inscrição).
 * Guardado na tabela de configuração (config_sistema, chave "convite:CÓDIGO"): não precisa de
 * tabela nova e vence sozinho — o convite e o JWT guardado expiram juntos (2, 12 ou 24 h) e os
 * vencidos são apagados.
 */
import "server-only";
import { VALIDADE_MAXIMA_MIN, conviteVencido, type OpcoesInstalacao } from "@/lib/convite";
import { prisma } from "@/lib/prisma";

const PREFIXO = "convite:";

export type Convite = { jwt: string; servidor: string; opcoes: OpcoesInstalacao; expiraEm?: string };

export const ConviteModel = {
  /** Cria o convite; devolve false se o código já existir (quem chama sorteia outro). */
  async criar(codigo: string, c: Convite): Promise<boolean> {
    const vencidos = new Date(Date.now() - VALIDADE_MAXIMA_MIN * 60_000);
    await prisma.configSistema.deleteMany({ where: { chave: { startsWith: PREFIXO }, atualizadoEm: { lt: vencidos } } });
    try {
      await prisma.configSistema.create({ data: { chave: PREFIXO + codigo, valor: JSON.stringify(c) } });
      return true;
    } catch {
      return false;
    }
  },

  /** Convite ainda válido, ou null. */
  async buscar(codigo: string): Promise<Convite | null> {
    const r = await prisma.configSistema.findUnique({ where: { chave: PREFIXO + codigo } });
    if (!r) return null;
    try {
      const c = JSON.parse(r.valor) as Convite;
      return conviteVencido(c, r.atualizadoEm) ? null : c;
    } catch {
      return null;
    }
  },
};
