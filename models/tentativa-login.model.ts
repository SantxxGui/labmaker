/** MODEL — TentativaLogin (tabela "tentativas_login") */
import "server-only";
import { JANELA_MIN, type Contagem } from "@/lib/limite-login";
import { prisma } from "@/lib/prisma";

export const TentativaLoginModel = {
  /** Falhas recentes do e-mail (desde o último sucesso) e do IP, dentro da janela. */
  async contarFalhas(email: string, ip: string | null): Promise<Contagem> {
    const desde = new Date(Date.now() - JANELA_MIN * 60_000);
    const ultimoSucesso = await prisma.tentativaLogin.findFirst({
      where: { email, sucesso: true, criadoEm: { gte: desde } }, orderBy: { criadoEm: "desc" }, select: { criadoEm: true },
    });
    const inicio = ultimoSucesso && ultimoSucesso.criadoEm > desde ? ultimoSucesso.criadoEm : desde;
    const [falhasEmail, falhasIp, primeira] = await Promise.all([
      prisma.tentativaLogin.count({ where: { email, sucesso: false, criadoEm: { gt: inicio } } }),
      ip ? prisma.tentativaLogin.count({ where: { ip, sucesso: false, criadoEm: { gte: desde } } }) : Promise.resolve(0),
      prisma.tentativaLogin.findFirst({ where: { email, sucesso: false, criadoEm: { gt: inicio } }, orderBy: { criadoEm: "asc" }, select: { criadoEm: true } }),
    ]);
    return { falhasEmail, falhasIp, primeiraFalha: primeira?.criadoEm ?? null };
  },

  async registrar(email: string, ip: string | null, sucesso: boolean) {
    await prisma.tentativaLogin.create({ data: { email, ip, sucesso } });
  },
};
