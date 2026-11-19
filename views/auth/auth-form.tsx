"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
import { cn, fetchJson } from "@/lib/utils";

type Mode = "login" | "cadastro";

/** Atalhos das contas do seed. Em produção: NEXT_PUBLIC_SHOW_DEMO_LOGIN=false */
const SHOW_DEMO = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGIN !== "false";
/** Conta criada pelo seed zerado. Alunos criam a própria conta; com `npm run db:demo` existem também gestor@ e usuario@. */
const DEMOS: { email: string; role: Role }[] = [
  { email: "lider@labmaker.dev", role: "LIDER" },
];

function forcaSenha(s: string) {
  let f = 0;
  if (s.length >= 8) f++;
  if (/[A-Z]/.test(s) && /[a-z]/.test(s)) f++;
  if (/\d/.test(s) || /[^A-Za-z0-9]/.test(s)) f++;
  return f;
}

export function AuthForm({ mode: inicial, next }: { mode: Mode; next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(inicial);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [senha, setSenha] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const isLogin = mode === "login";
  const forca = forcaSenha(senha);

  function trocar(m: Mode) {
    setMode(m);
    setError(null);
    setSenha("");
  }

  async function enviar(body: Record<string, FormDataEntryValue>, login: boolean, quem: string) {
    setError(null);
    setLoading(quem);
    try {
      const res = await fetchJson<{ redirectTo: string }>(login ? "/api/auth/login" : "/api/auth/cadastro", { method: "POST", body: JSON.stringify(body) });
      // ?next= só é aceito se for um caminho interno
      const destino = next && next.startsWith("/") && !next.startsWith("//") ? next : res.redirectTo;
      router.replace(destino);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível continuar.");
      setLoading(null);
    }
  }

  function entrarDemo(email: string) {
    if (emailRef.current) emailRef.current.value = email;
    setSenha("labmaker123");
    void enviar({ email, senha: "labmaker123" }, true, email);
  }

  return (
    <div className="w-full">
      <h1 className="text-center text-[26px] font-semibold tracking-[-0.03em]">{isLogin ? "Entrar no LabMaker" : "Criar conta"}</h1>
      <p className="mt-1.5 text-center text-sm text-muted">{isLogin ? "Use seu e-mail institucional." : "Novas contas entram com o perfil Aluno(a)."}</p>

      <div role="tablist" className="mt-7 grid grid-cols-2 rounded-xl border border-line bg-black/30 p-1">
        {(["login", "cadastro"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => trocar(m)} className={cn("h-8 rounded-lg text-[13px] font-medium transition-colors", mode === m ? "bg-white/[0.1] text-fg" : "text-muted hover:text-fg")}>
            {m === "login" ? "Entrar" : "Criar conta"}
          </button>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void enviar(Object.fromEntries(new FormData(e.currentTarget)), isLogin, "form"); }} className="mt-6 space-y-4" noValidate>
        {!isLogin && (
          <div className="grid grid-cols-5 gap-3">
            <Field label="Nome completo" htmlFor="nome" className="col-span-3"><Input id="nome" name="nome" autoComplete="name" required /></Field>
            <Field label="Matrícula" htmlFor="matricula" className="col-span-2"><Input id="matricula" name="matricula" className="font-mono" /></Field>
          </div>
        )}
        <Field label="E-mail" htmlFor="email">
          <Input ref={emailRef} id="email" name="email" type="email" autoComplete="email" placeholder="voce@faculdade.edu.br" aria-invalid={!!error} required autoFocus />
        </Field>
        <Field label="Senha" htmlFor="senha">
          <Input
            id="senha" name="senha" type={showPass ? "text" : "password"} autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder={isLogin ? "" : "Mínimo de 8 caracteres"} value={senha} onChange={(e) => setSenha(e.target.value)} aria-invalid={!!error} required
            trailing={
              <button type="button" onClick={() => setShowPass((v) => !v)} className="grid size-8 place-items-center rounded-md text-subtle hover:bg-raised hover:text-fg" aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}>
                {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
          />
          {!isLogin && senha.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2].map((i) => <span key={i} className={cn("h-1 flex-1 rounded-full", i < forca ? (forca === 1 ? "bg-danger" : forca === 2 ? "bg-warn" : "bg-ok") : "bg-line")} />)}
              </div>
              <span className="w-10 text-right text-[11px] text-subtle">{["Fraca", "Fraca", "Média", "Forte"][forca]}</span>
            </div>
          )}
        </Field>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="group w-full" loading={loading === "form"} disabled={!!loading}>
          {isLogin ? "Entrar" : "Criar conta"}
          {loading !== "form" && <ArrowRight className="transition-transform group-hover:translate-x-0.5" />}
        </Button>
      </form>

      {SHOW_DEMO && isLogin && (
        <div className="mt-8 border-t border-line pt-6">
          <p className="eyebrow text-center">Contas de demonstração — entrar como</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {DEMOS.map((d) => (
              <button key={d.email} type="button" disabled={!!loading} onClick={() => entrarDemo(d.email)} className={cn("h-8 rounded-full border border-line-strong bg-white/[0.03] px-3.5 text-[13px] text-fg transition-colors hover:border-white/30 hover:bg-white/[0.08] disabled:opacity-50", loading === d.email && "border-signal/60 bg-signal/10")}>
                {ROLE_LABEL[d.role].split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
