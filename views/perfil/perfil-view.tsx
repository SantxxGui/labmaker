"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { ROLE_LABEL } from "@/lib/permissions";
import type { UsuarioDTO } from "@/lib/types";
import { cn, fetchJson, formatData } from "@/lib/utils";

/** 0–3: tamanho, maiúscula + minúscula, número ou símbolo (mesma régua do cadastro) */
function forcaSenha(s: string) {
  let f = 0;
  if (s.length >= 8) f++;
  if (/[A-Z]/.test(s) && /[a-z]/.test(s)) f++;
  if (/\d/.test(s) || /[^A-Za-z0-9]/.test(s)) f++;
  return f;
}
const FORCA = ["Muito fraca", "Fraca", "Boa", "Forte"];

export function PerfilView({ inicial }: { inicial: UsuarioDTO }) {
  const router = useRouter();
  const [usuario, setUsuario] = useState(inicial);
  const [nome, setNome] = useState(inicial.nome);
  const [salvandoNome, setSalvandoNome] = useState(false);

  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [ver, setVer] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const [erroSenha, setErroSenha] = useState<string | null>(null);

  const nomeMudou = nome.trim() !== usuario.nome && nome.trim().length >= 3;
  const forca = forcaSenha(nova);
  const naoConfere = confirma.length > 0 && confirma !== nova;

  async function salvarNome(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeMudou) return;
    setSalvandoNome(true);
    try {
      const r = await fetchJson<{ usuario: UsuarioDTO }>("/api/auth/perfil", { method: "PATCH", body: JSON.stringify({ nome: nome.trim() }) });
      setUsuario(r.usuario);
      setNome(r.usuario.nome);
      toast.success("Nome atualizado", { description: "Já aparece assim em todo o sistema." });
      router.refresh(); // o topo da página mostra o nome novo
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvandoNome(false);
    }
  }

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault();
    setErroSenha(null);
    if (nova !== confirma) return setErroSenha("A confirmação não confere com a nova senha.");
    setTrocando(true);
    try {
      await fetchJson("/api/auth/senha", { method: "POST", body: JSON.stringify({ senhaAtual: atual, novaSenha: nova }) });
      setAtual(""); setNova(""); setConfirma("");
      toast.success("Senha trocada", { description: "Você continua conectado aqui. Outros aparelhos com a sua conta foram desconectados." });
    } catch (err) {
      setErroSenha(err instanceof Error ? err.message : "Não foi possível trocar a senha.");
    } finally {
      setTrocando(false);
    }
  }

  const olho = (
    <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? "Esconder senhas" : "Mostrar senhas"} className="grid size-8 place-items-center rounded-md text-subtle hover:text-fg">
      {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Sua conta" title="Meu perfil" description="Seu nome como aparece no sistema e a sua senha." />

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <Avatar nome={usuario.nome} className="size-14 text-base" />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold tracking-tight">{usuario.nome}</p>
            <p className="truncate text-sm text-muted">{usuario.email}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-subtle">
              <Badge>{ROLE_LABEL[usuario.role]}</Badge>
              {usuario.matricula && <span className="font-mono">mat. {usuario.matricula}</span>}
              <span>desde {formatData(usuario.criadoEm)}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <form onSubmit={salvarNome} className="space-y-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold"><UserRound className="size-4 text-subtle" />Nome</h2>
          <Field label="Nome completo" htmlFor="nome" hint="Aparece nas reservas, no atendimento e na auditoria. No modo TV, só o primeiro nome e a inicial.">
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} minLength={3} maxLength={80} required autoComplete="name" />
          </Field>
          <Field label="E-mail" htmlFor="email" hint="O e-mail é o seu login. Para trocar, fale com o Líder do espaço.">
            <Input id="email" value={usuario.email} disabled />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={salvandoNome} disabled={!nomeMudou}>Salvar nome</Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <form onSubmit={trocarSenha} className="space-y-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold"><KeyRound className="size-4 text-subtle" />Trocar senha</h2>
          <Field label="Senha atual" htmlFor="atual">
            <Input id="atual" type={ver ? "text" : "password"} value={atual} onChange={(e) => setAtual(e.target.value)} required autoComplete="current-password" trailing={olho} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nova senha" htmlFor="nova">
              <Input id="nova" type={ver ? "text" : "password"} value={nova} onChange={(e) => setNova(e.target.value)} minLength={8} required autoComplete="new-password" />
            </Field>
            <Field label="Confirme a nova senha" htmlFor="confirma">
              <Input id="confirma" type={ver ? "text" : "password"} value={confirma} onChange={(e) => setConfirma(e.target.value)} required autoComplete="new-password" aria-invalid={naoConfere} />
            </Field>
          </div>
          {nova && (
            <div className="space-y-1.5" aria-live="polite">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className={cn("h-1 flex-1 rounded-full bg-white/[0.08]", i < forca && (forca === 3 ? "bg-ok" : forca === 2 ? "bg-signal" : "bg-danger"))} />
                ))}
              </div>
              <p className="text-xs text-subtle">Força: <span className="text-muted">{FORCA[forca]}</span> · mínimo de 8 caracteres; misture maiúsculas, minúsculas e números</p>
            </div>
          )}
          {(erroSenha || naoConfere) && <p className="text-sm text-danger">{erroSenha ?? "A confirmação não confere com a nova senha."}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs text-subtle"><ShieldCheck className="size-3.5" />Ao trocar, os outros aparelhos com a sua conta são desconectados.</p>
            <Button type="submit" loading={trocando} disabled={!atual || nova.length < 8 || naoConfere}>Trocar senha</Button>
          </div>
        </form>
      </Card>

      <p className="px-1 text-xs text-subtle">
        A senha é guardada só como hash (bcrypt): ninguém consegue lê-la, nem o Líder. Esqueceu? O Líder gera uma senha temporária para você na aba Usuários.
      </p>
    </div>
  );
}
