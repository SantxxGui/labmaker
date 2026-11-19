"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader, SearchInput, td, th, tr } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PERMISSOES, ROLES, ROLE_DESCRICAO, ROLE_LABEL, type Role } from "@/lib/permissions";
import type { UsuarioDTO } from "@/lib/types";
import { cn, fetchJson, formatData } from "@/lib/utils";

export function UsuariosView({ inicial, euId }: { inicial: UsuarioDTO[]; euId: string }) {
  const [usuarios, setUsuarios] = useState(inicial);
  const [busca, setBusca] = useState("");
  const [pendente, setPendente] = useState<string | null>(null);
  const [senha, setSenha] = useState<{ nome: string; email: string; valor: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function redefinirSenha(u: UsuarioDTO) {
    setPendente(u.id);
    try {
      const r = await fetchJson<{ senhaTemporaria: string }>(`/api/usuarios/${u.id}/senha`, { method: "POST", body: "{}" });
      setSenha({ nome: u.nome, email: u.email, valor: r.senhaTemporaria });
      setCopiado(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível redefinir a senha.");
    } finally {
      setPendente(null);
    }
  }

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return usuarios.filter((u) => !q || [u.nome, u.email, u.cargo, u.matricula, ROLE_LABEL[u.role]].some((v) => v?.toLowerCase().includes(q)));
  }, [usuarios, busca]);

  async function atualizar(u: UsuarioDTO, dados: { role?: Role; ativo?: boolean }) {
    setPendente(u.id);
    setUsuarios((l) => l.map((x) => (x.id === u.id ? { ...x, ...dados } : x)));
    try {
      await fetchJson(`/api/usuarios/${u.id}`, { method: "PATCH", body: JSON.stringify(dados) });
      toast.success(`${u.nome} atualizado`, {
        description: dados.role ? `Perfil: ${ROLE_LABEL[dados.role]}` : dados.ativo ? "Conta reativada" : "Conta desativada — o acesso foi bloqueado",
      });
    } catch (err) {
      setUsuarios((l) => l.map((x) => (x.id === u.id ? u : x)));
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar.");
    } finally {
      setPendente(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Governança" title="Usuários e senhas" description="O Líder cuida das contas: perfis, bloqueio e redefinição de senha. As senhas ficam guardadas só como hash (bcrypt) — ninguém consegue lê-las, nem o Líder. Toda alteração vai para a auditoria." />

      <Card className="overflow-hidden">
        <CardHeader title={`${usuarios.filter((u) => u.ativo).length} contas ativas`} actions={<SearchInput value={busca} onChange={setBusca} placeholder="Buscar nome, e-mail, cargo…" />} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr>
                <th className={th}>Usuário</th>
                <th className={th}>Cargo</th>
                <th className={th}>Perfil de acesso</th>
                <th className={th}>Desde</th>
                <th className={th}>Acesso</th>
                <th className={th}><span className="sr-only">Senha</span></th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((u) => {
                const eu = u.id === euId;
                return (
                  <tr key={u.id} className={cn(tr, !u.ativo && "opacity-55")}>
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <Avatar nome={u.nome} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-fg">{u.nome}{eu && <Badge className="ml-2 h-5">você</Badge>}</p>
                          <p className="truncate text-xs text-subtle">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className={td}>
                      <p className="text-[13px] text-muted">{u.cargo ?? "—"}</p>
                      <p className="font-mono text-[11px] text-subtle">{u.matricula ? `mat. ${u.matricula}` : ""}</p>
                    </td>
                    <td className={td}>
                      <Select value={u.role} onValueChange={(v) => atualizar(u, { role: v as Role })} disabled={eu || pendente === u.id || !u.ativo}>
                        <SelectTrigger className="h-8 w-52 text-[13px]" aria-label={`Perfil de ${u.nome}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className={cn(td, "font-mono text-xs text-muted")}>{formatData(u.criadoEm)}</td>
                    <td className={td}>
                      <div className="flex items-center gap-2.5">
                        <Switch checked={u.ativo} disabled={eu || pendente === u.id} onCheckedChange={(ativo) => atualizar(u, { ativo })} aria-label={`Acesso de ${u.nome}`} />
                        <span className="text-xs text-muted">{u.ativo ? "Ativo" : "Bloqueado"}</span>
                      </div>
                    </td>
                    <td className={cn(td, "text-right")}>
                      {!eu && (
                        <Button size="sm" variant="ghost" loading={pendente === u.id} onClick={() => redefinirSenha(u)} disabled={!u.ativo} title="Gera uma senha temporária e encerra as sessões abertas">
                          <KeyRound />Redefinir senha
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!senha} onOpenChange={(o) => !o && setSenha(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="size-4 text-signal" />Senha temporária</DialogTitle>
            <DialogDescription>
              Passe esta senha para <span className="text-fg">{senha?.nome}</span> ({senha?.email}). Ela aparece só agora — o sistema guarda apenas o hash.
              As sessões abertas dessa conta foram encerradas.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-black/40 p-3">
            <code className="flex-1 text-center font-mono text-[22px] tracking-[0.12em] text-fg">{senha?.valor}</code>
            <button
              aria-label="Copiar senha"
              onClick={async () => { try { await navigator.clipboard.writeText(senha!.valor); setCopiado(true); } catch { toast.error("Copie manualmente."); } }}
              className="grid size-9 place-items-center rounded-md text-subtle hover:bg-white/10 hover:text-fg"
            >
              {copiado ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
            </button>
          </div>
          <div className="flex justify-end"><Button onClick={() => setSenha(null)}>Pronto</Button></div>
        </DialogContent>
      </Dialog>

      {/* Matriz de permissões: gerada da mesma fonte que a API usa (lib/permissions.ts) */}
      <Card className="overflow-hidden">
        <CardHeader title="Matriz de permissões" description="O que cada perfil pode fazer. A API valida estas mesmas regras em toda requisição." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                <th className={th}>Permissão</th>
                {ROLES.map((r) => <th key={r} className={cn(th, "text-center")} title={ROLE_DESCRICAO[r]}>{ROLE_LABEL[r].split(" ")[0]}</th>)}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(PERMISSOES) as (keyof typeof PERMISSOES)[]).map((p) => (
                <tr key={p} className="border-t border-line">
                  <td className="px-5 py-2 font-mono text-[12px] text-muted">{p}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-5 py-2 text-center">
                      {(PERMISSOES[p] as readonly Role[]).includes(r) ? <span className="inline-block size-2 rounded-full bg-ok" aria-label="permitido" /> : <span className="text-subtle/50">–</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
