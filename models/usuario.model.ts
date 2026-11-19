/** MODEL — Usuario (tabela "usuarios") */
import "server-only";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/permissions";
import type { UsuarioDTO } from "@/lib/types";

const toDTO = (u: {
  id: string; nome: string; email: string; role: Role; matricula: string | null;
  cargo: string | null; ativo: boolean; criadoEm: Date;
}): UsuarioDTO => ({
  id: u.id, nome: u.nome, email: u.email, role: u.role, matricula: u.matricula,
  cargo: u.cargo, ativo: u.ativo, criadoEm: u.criadoEm.toISOString(),
});

export const UsuarioModel = {
  buscarPorEmail(email: string) {
    return prisma.usuario.findUnique({ where: { email } });
  },

  /** Dados mínimos para validar uma sessão a cada requisição. */
  buscarSessao(id: string) {
    return prisma.usuario.findUnique({ where: { id }, select: { nome: true, email: true, role: true, ativo: true, sessaoVersao: true } });
  },

  /** Alunos ativos (para empréstimo de notebook). */
  async listarAlunos() {
    return prisma.usuario.findMany({ where: { ativo: true, role: "USUARIO" }, select: { id: true, nome: true, matricula: true }, orderBy: { nome: "asc" } });
  },

  buscarPorId(id: string) {
    return prisma.usuario.findUnique({ where: { id } });
  },

  /** Usuário que já usa este e-mail OU esta matrícula (evita duplicidade). */
  buscarDuplicado(email: string, matricula?: string | null) {
    return prisma.usuario.findFirst({
      where: { OR: [{ email }, ...(matricula ? [{ matricula }] : [])] },
      select: { email: true },
    });
  },

  criar(dados: { nome: string; email: string; matricula: string | null; senhaHash: string }) {
    return prisma.usuario.create({ data: { ...dados, role: "USUARIO" } });
  },

  async listar() {
    const rows = await prisma.usuario.findMany({ orderBy: [{ ativo: "desc" }, { nome: "asc" }] });
    return rows.map(toDTO);
  },

  /**
   * Trocar perfil ou desativar incrementa a versão da sessão: quem estiver logado cai na hora.
   * Só corrigir o nome não derruba ninguém (o nome é relido do banco a cada requisição).
   */
  async atualizar(id: string, dados: { nome?: string; role?: Role; ativo?: boolean }) {
    const derruba = dados.role !== undefined || dados.ativo !== undefined;
    return toDTO(await prisma.usuario.update({ where: { id }, data: { ...dados, ...(derruba ? { sessaoVersao: { increment: 1 } } : {}) } }));
  },

  /** Dados do próprio usuário para a página Meu perfil. */
  async perfil(id: string) {
    const u = await prisma.usuario.findUnique({ where: { id } });
    return u ? toDTO(u) : null;
  },

  async renomear(id: string, nome: string) {
    return toDTO(await prisma.usuario.update({ where: { id }, data: { nome } }));
  },

  /** O próprio usuário troca a senha: as outras sessões caem; quem trocou recebe uma sessão nova. */
  trocarSenha(id: string, senhaHash: string) {
    return prisma.usuario.update({
      where: { id }, data: { senhaHash, sessaoVersao: { increment: 1 } },
      select: { id: true, nome: true, email: true, role: true, sessaoVersao: true },
    });
  },

  contarLideresAtivos() {
    return prisma.usuario.count({ where: { role: "LIDER", ativo: true } });
  },

  /** Nova senha (já em hash) + derruba as sessões abertas daquela conta. */
  async redefinirSenha(id: string, senhaHash: string) {
    await prisma.usuario.update({ where: { id }, data: { senhaHash, sessaoVersao: { increment: 1 } } });
  },
};
