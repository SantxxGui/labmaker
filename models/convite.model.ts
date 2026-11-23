/**
 * MODEL — Convite de instalação do agente (código curto → código de inscrição).
 * Guardado na tabela de configuração (config_sistema, chave "convite:CÓDIGO"): não precisa de
 * tabela nova e vence sozinho — o JWT guardado expira em 2 h e os vencidos são apagados.
 */
import "server-only";
import { VALIDADE_CONVITE_MIN, type OpcoesInstalacao } from "@/lib/convite";
import { prisma } from "@/lib/prisma";

const PREFIXO = "convite:";

export type Convite = { jwt: string; servidor: string; opcoes: OpcoesInstalacao };

export const ConviteModel = {
  /** Cria o convite; devolve false se o código já existir (quem chama sorteia outro). */
  async criar(codigo: string, c: Convite): Promise<boolean> {
    const vencidos = new Date(Date.now() - VALIDADE_CONVITE_MIN * 60_000);
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
    if (!r || r.atualizadoEm.getTime() < Date.now() - VALIDADE_CONVITE_MIN * 60_000) return null;
    try {
      return JSON.parse(r.valor) as Convite;
    } catch {
      return null;
    }
  },
};
