/**
 * RBAC — matriz de permissões por perfil.
 * Única fonte de verdade: API, páginas e menu consultam `can()`.
 * Este módulo não tem dependências (pode ser usado no cliente e no proxy).
 */
export const ROLES = ["LIDER", "GESTOR", "USUARIO"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Regra do espaço: o Líder (OED — Orientador Educacional Digital — ou Estagiário EMK) cuida de tudo:
 * cadastra máquinas, áreas, notebooks, políticas e empréstimos, gerencia contas e senhas e lê a auditoria.
 * O controle sobre o próprio Líder é a trilha de auditoria IMUTÁVEL no banco: nem ele consegue apagar o que fez.
 */
export const PERMISSOES = {
  "painel:ver": ["LIDER", "GESTOR"],
  "reserva:criar": ["LIDER", "GESTOR", "USUARIO"],
  "reserva:ver_todas": ["LIDER", "GESTOR"],
  "reserva:cancelar_qualquer": ["LIDER", "GESTOR"],
  "equipamento:ver": ["LIDER", "GESTOR", "USUARIO"],
  "equipamento:gerenciar": ["LIDER"],
  "equipamento:alterar_status": ["LIDER"],
  "manutencao:ver": ["LIDER", "GESTOR"],
  "manutencao:registrar": ["LIDER"],
  "maquina:monitorar": ["LIDER", "GESTOR"],
  "maquina:comandar": ["LIDER", "GESTOR"],
  "dispositivo:ver": ["LIDER", "GESTOR"],
  "dispositivo:comandar": ["LIDER", "GESTOR"],
  "dispositivo:cadastrar": ["LIDER"],
  "dispositivo:politicas": ["LIDER"],
  "emprestimo:gerenciar": ["LIDER"],
  "dispositivo:apagar": ["LIDER"],
  "laboratorio:gerenciar": ["LIDER"],
  "usuario:gerenciar": ["LIDER"],
  "auditoria:ver": ["LIDER"],
} as const satisfies Record<string, readonly Role[]>;

export type Permissao = keyof typeof PERMISSOES;

export function can(role: Role, permissao: Permissao): boolean {
  return (PERMISSOES[permissao] as readonly Role[]).includes(role);
}

export const ROLE_LABEL: Record<Role, string> = {
  LIDER: "Líder (OED / Estagiário EMK)",
  GESTOR: "Professor(a)",
  USUARIO: "Aluno(a)",
};

export const ROLE_DESCRICAO: Record<Role, string> = {
  LIDER: "Líder do espaço (Orientador Educacional Digital ou Estagiário EMK): cuida de tudo — cadastros, máquinas, notebooks, empréstimos, contas, senhas e auditoria.",
  GESTOR: "Professor(a): acompanha o uso, reserva para turmas, pausa máquinas e envia avisos aos notebooks. Não cadastra.",
  USUARIO: "Aluno(a): consulta as máquinas e reserva o que o Líder cadastrou.",
};

/** Página inicial de cada perfil após o login. */
export function homeFor(role: Role) {
  return can(role, "painel:ver") ? "/painel" : "/reservas";
}
