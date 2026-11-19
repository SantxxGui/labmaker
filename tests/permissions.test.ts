import { describe, expect, it } from "vitest";
import { PERMISSOES, ROLES, can, homeFor, type Permissao } from "@/lib/permissions";

const TODAS = Object.keys(PERMISSOES) as Permissao[];
/** Tudo que cria ou altera cadastro, contas ou senhas. */
const ADMINISTRATIVAS: Permissao[] = [
  "equipamento:gerenciar", "equipamento:alterar_status", "laboratorio:gerenciar", "manutencao:registrar",
  "dispositivo:cadastrar", "dispositivo:politicas", "dispositivo:apagar", "emprestimo:gerenciar",
  "usuario:gerenciar", "auditoria:ver",
];

describe("RBAC — três perfis", () => {
  it("existem só Líder, Professor(a) e Aluno(a)", () => {
    expect([...ROLES]).toEqual(["LIDER", "GESTOR", "USUARIO"]);
  });
  it("o Líder (OED / Estagiário EMK) pode tudo", () => {
    for (const p of TODAS) expect(can("LIDER", p), p).toBe(true);
  });
  it("só o Líder cadastra, cuida de contas e senhas e lê a auditoria", () => {
    for (const p of ADMINISTRATIVAS) expect(ROLES.filter((r) => can(r, p)), p).toEqual(["LIDER"]);
  });
  it("professor acompanha, pausa máquinas e envia avisos, sem cadastrar", () => {
    expect(can("GESTOR", "maquina:comandar")).toBe(true);
    expect(can("GESTOR", "dispositivo:comandar")).toBe(true);
    expect(can("GESTOR", "reserva:ver_todas")).toBe(true);
    for (const p of ADMINISTRATIVAS) expect(can("GESTOR", p), p).toBe(false);
  });
  it("aluno só consulta máquinas e reserva", () => {
    expect(TODAS.filter((p) => can("USUARIO", p)).sort()).toEqual(["equipamento:ver", "reserva:criar"]);
  });
  it("cada perfil cai na página inicial certa", () => {
    expect(homeFor("USUARIO")).toBe("/reservas");
    expect(homeFor("LIDER")).toBe("/painel");
    expect(homeFor("GESTOR")).toBe("/painel");
  });
});
