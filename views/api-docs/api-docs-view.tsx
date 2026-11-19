"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ChevronDown, FileJson, KeyRound, Lock, Play, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";

type Operacao = {
  tags: string[]; summary: string; description?: string; "x-permissao"?: string;
  security: Record<string, unknown>[]; parameters?: { name: string; in: string; description?: string }[];
  requestBody?: { content: { "application/json": { schema: Record<string, unknown> } } };
  responses: Record<string, { description: string }>;
};
export type Spec = { info: { title: string; version: string; description: string }; tags: { name: string }[]; paths: Record<string, Record<string, Operacao>> };

const COR_METODO: Record<string, string> = {
  get: "border-info/30 bg-info-soft text-info", post: "border-ok/30 bg-ok-soft text-ok",
  patch: "border-warn/30 bg-warn-soft text-warn", delete: "border-danger/30 bg-danger-soft text-danger",
};

/** Exemplo mínimo a partir do JSON Schema (para preencher o "Testar"). */
function exemplo(s: Record<string, unknown>): unknown {
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum)) return s.enum[0];
  if (Array.isArray(s.anyOf)) return exemplo(s.anyOf[0] as Record<string, unknown>);
  switch (s.type) {
    case "object": {
      const props = (s.properties ?? {}) as Record<string, Record<string, unknown>>;
      const req = new Set((s.required as string[]) ?? []);
      return Object.fromEntries(Object.entries(props).filter(([k]) => req.has(k)).map(([k, v]) => [k, exemplo(v)]));
    }
    case "array": return [];
    case "number": case "integer": return (s.minimum as number) ?? 0;
    case "boolean": return false;
    default: return s.format === "email" ? "aluno@labmaker.dev" : "";
  }
}

function Endpoint({ metodo, caminho, op }: { metodo: string; caminho: string; op: Operacao }) {
  const [aberto, setAberto] = useState(false);
  const [url, setUrl] = useState(caminho);
  const [corpo, setCorpo] = useState(() => (op.requestBody ? JSON.stringify(exemplo(op.requestBody.content["application/json"].schema), null, 2) : ""));
  const [resposta, setResposta] = useState<{ status: number; ms: number; texto: string } | null>(null);
  const [rodando, setRodando] = useState(false);
  const publico = op.security.length === 0;
  const agente = op.security.some((s) => "tokenAgente" in s);
  const temChave = /\{\w+\}/.test(url);

  async function testar() {
    setRodando(true);
    const t0 = performance.now();
    try {
      const r = await fetch(url, {
        method: metodo.toUpperCase(),
        headers: corpo ? { "Content-Type": "application/json" } : undefined,
        body: metodo === "get" || !corpo ? undefined : corpo,
      });
      const tipo = r.headers.get("content-type") ?? "";
      const texto = tipo.includes("json") ? JSON.stringify(await r.json(), null, 2) : (await r.text()).slice(0, 4000);
      setResposta({ status: r.status, ms: Math.round(performance.now() - t0), texto });
    } catch (e) {
      setResposta({ status: 0, ms: 0, texto: String(e) });
    } finally { setRodando(false); }
  }

  return (
    <li className="border-t border-line first:border-t-0">
      <button onClick={() => setAberto((a) => !a)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-white/[0.025]" aria-expanded={aberto}>
        <span className={cn("w-16 shrink-0 rounded border py-0.5 text-center font-mono text-[10.5px] font-semibold uppercase", COR_METODO[metodo])}>{metodo}</span>
        <code className="min-w-0 shrink-0 font-mono text-[13px] text-fg">{caminho}</code>
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{op.summary}</span>
        {publico ? <Unlock className="size-3.5 shrink-0 text-subtle" aria-label="Público" /> : agente ? <KeyRound className="size-3.5 shrink-0 text-signal" aria-label="Token do agente" /> : <Lock className="size-3.5 shrink-0 text-subtle" aria-label="Exige sessão" />}
        <ChevronDown className={cn("size-4 shrink-0 text-subtle transition-transform", aberto && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid gap-4 px-5 pb-5 lg:grid-cols-2">
              <div className="space-y-3 text-[13px]">
                <p className="text-muted">
                  {publico ? "Público." : agente ? "Autenticação: Bearer lmk_… (token do agente)." : "Autenticação: cookie de sessão."}
                  {op["x-permissao"] && <> Permissão: <code className="font-mono text-fg">{op["x-permissao"]}</code>.</>}
                </p>
                {op.parameters && (
                  <ul className="space-y-1">
                    {op.parameters.map((p) => <li key={p.name} className="font-mono text-[12px] text-muted"><span className="text-fg">{p.name}</span> · {p.in}{p.description ? ` · ${p.description}` : ""}</li>)}
                  </ul>
                )}
                <ul className="space-y-1">
                  {Object.entries(op.responses).map(([c, r]) => (
                    <li key={c} className="flex gap-2 text-[12px]"><span className={cn("font-mono", Number(c) < 300 ? "text-ok" : Number(c) < 500 ? "text-warn" : "text-danger")}>{c}</span><span className="text-muted">{r.description}</span></li>
                  ))}
                </ul>
                {op.requestBody && (
                  <details className="rounded-lg border border-line">
                    <summary className="cursor-pointer px-3 py-2 text-[12px] text-muted">Schema do corpo (gerado do Zod)</summary>
                    <pre className="max-h-64 overflow-auto px-3 pb-3 font-mono text-[11px] text-muted">{JSON.stringify(op.requestBody.content["application/json"].schema, null, 2)}</pre>
                  </details>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="URL" className="h-8 min-w-0 flex-1 rounded-md border border-line-strong bg-black/30 px-2.5 font-mono text-[12px] focus:border-accent focus:outline-none" />
                  <button onClick={testar} disabled={rodando || temChave || agente} title={temChave ? "Troque {id} por um id real" : agente ? "Use o agente (agente/agente.mjs)" : undefined}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-fg px-3 text-[12px] font-medium text-bg disabled:opacity-40">
                    <Play className="size-3.5" />{rodando ? "…" : "Testar"}
                  </button>
                </div>
                {op.requestBody && (
                  <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} spellCheck={false} rows={Math.min(10, corpo.split("\n").length + 1)} aria-label="Corpo JSON"
                    className="w-full rounded-md border border-line-strong bg-black/30 p-2.5 font-mono text-[11.5px] focus:border-accent focus:outline-none" />
                )}
                {resposta && (
                  <div className="rounded-md border border-line bg-black/40">
                    <p className="flex justify-between border-b border-line px-2.5 py-1.5 font-mono text-[11px]">
                      <span className={resposta.status < 300 ? "text-ok" : resposta.status < 500 ? "text-warn" : "text-danger"}>HTTP {resposta.status}</span>
                      <span className="text-subtle">{resposta.ms} ms</span>
                    </p>
                    <pre className="max-h-72 overflow-auto p-2.5 font-mono text-[11px] text-muted">{resposta.texto}</pre>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export function ApiDocsView({ spec }: { spec: Spec }) {
  const ops = Object.entries(spec.paths).flatMap(([caminho, m]) => Object.entries(m).map(([metodo, op]) => ({ caminho, metodo, op })));
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-subtle hover:text-fg"><ArrowLeft className="size-3.5" />LabMaker</Link>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Referência · OpenAPI 3.1 · v{spec.info.version}</p>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em]">{spec.info.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">{spec.info.description} {ops.length} operações. O botão “Testar” usa a sua sessão atual: entre no sistema em outra aba para testar rotas protegidas.</p>
        </div>
        <a href="/api/openapi.json" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong px-3.5 text-[13px] font-medium hover:bg-white/5"><FileJson className="size-4" />openapi.json</a>
      </header>
      {spec.tags.map(({ name }) => {
        const doGrupo = ops.filter((o) => o.op.tags[0] === name);
        if (!doGrupo.length) return null;
        return (
          <section key={name} className="glass overflow-hidden rounded-2xl border border-line">
            <h2 className="border-b border-line px-5 py-3 text-[14px] font-semibold">{name} <span className="font-normal text-subtle">· {doGrupo.length}</span></h2>
            <ul>{doGrupo.map((o) => <Endpoint key={o.metodo + o.caminho} {...o} />)}</ul>
          </section>
        );
      })}
    </main>
  );
}
