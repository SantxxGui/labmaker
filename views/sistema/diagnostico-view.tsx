"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, Lock, LockOpen, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { cn, tempoRelativo } from "@/lib/utils";

type Endereco = { ip: string; interface: string; tipo: "wifi" | "cabo" | "virtual" | "outro"; url: string };
type Diag = {
  banco: { ok: boolean; ms: number };
  servidor?: { node: string; ambiente: string; ligadoHaMin: number; horaEspaco: string; espacoAberto: boolean };
  conexao?: { https: boolean; host: string; tunel: boolean; localhost: boolean };
  enderecos?: Endereco[];
  espaco?: { areas: number; maquinas: number; maquinasLivres: number; aparelhos: number; alunos: number; professores: number; politicasFechamento: number };
  agentes?: { id: string; hostname: string; tipo: string; so: string; agenteVersao: string; online: boolean; ultimoContatoEm: string | null; web: boolean }[];
  atendimento?: { chamadosAbertos: number; telasAtivas: number };
  push?: { inscritos: number };
};

type Nivel = "ok" | "aviso" | "erro";
type Item = { nivel: Nivel; titulo: string; detalhe: string; link?: { href: string; rotulo: string } };

const ICONE: Record<Nivel, React.ReactNode> = {
  ok: <CheckCircle2 className="size-4 text-ok" />,
  aviso: <AlertTriangle className="size-4 text-warn" />,
  erro: <XCircle className="size-4 text-danger" />,
};

/** Checklist da pré-apresentação: transforma o diagnóstico em itens "pronto / atenção / falta". */
function checklist(d: Diag): Item[] {
  if (!d.banco.ok) return [{ nivel: "erro", titulo: "Banco de dados", detalhe: "Sem resposta do PostgreSQL. Confira o DATABASE_URL e se o banco está ligado (docker compose up -d db)." }];
  const e = d.espaco!, c = d.conexao!, ag = d.agentes ?? [];
  const pcs = ag.filter((a) => a.tipo !== "SMARTPHONE" && a.tipo !== "TABLET");
  const celulares = ag.filter((a) => a.tipo === "SMARTPHONE" || a.tipo === "TABLET");
  return [
    { nivel: "ok", titulo: "Banco de dados", detalhe: `Respondendo em ${d.banco.ms} ms.` },
    c.localhost
      ? { nivel: "aviso", titulo: "Endereço do servidor", detalhe: "Você abriu por localhost: a VM e o celular não alcançam esse endereço. Abra pelo IP da rede (lista ao lado) antes de gerar convites." }
      : { nivel: "ok", titulo: "Endereço do servidor", detalhe: `Aberto por ${c.host}${c.tunel ? " (túnel HTTPS)" : ""}.` },
    c.https
      ? { nivel: "ok", titulo: "HTTPS", detalhe: "Ativo: o celular pode instalar o app e receber notificações; a tela pelo navegador funciona." }
      : { nivel: "aviso", titulo: "HTTPS", detalhe: "Sem HTTPS: o celular funciona, mas notificação push e instalar como app exigem HTTPS (use o túnel do docs/CONECTIVIDADE.md). O agente Node da VM não precisa." },
    e.areas ? { nivel: "ok", titulo: "Laboratórios", detalhe: `${e.areas} área(s) cadastrada(s).` } : { nivel: "erro", titulo: "Laboratórios", detalhe: "Nenhum laboratório ainda.", link: { href: "/laboratorios", rotulo: "Cadastrar" } },
    e.maquinas ? { nivel: "ok", titulo: "Máquinas", detalhe: `${e.maquinas} máquina(s), ${e.maquinasLivres} livre(s) para reserva.` } : { nivel: "erro", titulo: "Máquinas", detalhe: "Nenhuma máquina cadastrada.", link: { href: "/equipamentos", rotulo: "Cadastrar" } },
    e.alunos ? { nivel: "ok", titulo: "Alunos", detalhe: `${e.alunos} aluno(s) e ${e.professores} professor(es).` } : { nivel: "aviso", titulo: "Alunos", detalhe: "Ninguém se cadastrou ainda — peça para um colega criar conta em /cadastro.", link: { href: "/usuarios", rotulo: "Usuários" } },
    pcs.some((a) => a.online)
      ? { nivel: "ok", titulo: "Computador com agente", detalhe: `${pcs.filter((a) => a.online).map((a) => a.hostname).join(", ")} online.` }
      : { nivel: pcs.length ? "aviso" : "erro", titulo: "Computador com agente", detalhe: pcs.length ? `${pcs.map((a) => a.hostname).join(", ")} cadastrado(s), mas offline. Ligue a VM (o agente inicia sozinho se instalado como serviço).` : "Nenhum computador com agente real. Adicione a VM em Notebooks → Adicionar aparelho.", link: { href: "/dispositivos", rotulo: "Notebooks" } },
    celulares.some((a) => a.online)
      ? { nivel: "ok", titulo: "Celular", detalhe: `${celulares.filter((a) => a.online).map((a) => a.hostname).join(", ")} conectado.` }
      : { nivel: "aviso", titulo: "Celular", detalhe: celulares.length ? "Cadastrado, mas com a página do agente fechada. Peça para abrir o atalho no celular." : "Nenhum celular inscrito (opcional, mas impressiona na banca).", link: { href: "/dispositivos", rotulo: "Notebooks" } },
    e.politicasFechamento
      ? { nivel: "ok", titulo: "Fechamento automático", detalhe: `${e.politicasFechamento} política(s) travam os aparelhos às 20h e no domingo. Teste abaixo.` }
      : { nivel: "aviso", titulo: "Fechamento automático", detalhe: "Nenhuma política com “Travar fora do horário”.", link: { href: "/dispositivos/politicas", rotulo: "Políticas" } },
    d.push!.inscritos
      ? { nivel: "ok", titulo: "Notificações push", detalhe: `${d.push!.inscritos} aparelho(s) recebem notificação mesmo com o app fechado.` }
      : { nivel: "aviso", titulo: "Notificações push", detalhe: "Nenhum aparelho inscrito. No celular (com HTTPS), toque em “Ativar notificações” na página do agente." },
  ];
}

export function DiagnosticoView() {
  const [d, setD] = useState<Diag | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [testando, setTestando] = useState<"fechar" | "abrir" | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/sistema/diagnostico", { cache: "no-store" });
      setD(await r.json());
    } catch { toast.error("Servidor sem resposta."); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); const t = setInterval(carregar, 10_000); return () => clearInterval(t); }, [carregar]);

  async function testar(acao: "fechar" | "abrir") {
    setTestando(acao);
    try {
      const r = await fetch("/api/sistema/fechamento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }) });
      const j = await r.json();
      if (!r.ok) return toast.error(j.error ?? "Falhou.");
      toast.success(acao === "fechar" ? `Fechamento simulado: ${j.aparelhos.length} aparelho(s) travado(s)` : `Abertura simulada: ${j.aparelhos.length} aparelho(s) liberado(s)`, {
        description: j.aparelhos.length ? j.aparelhos.join(", ") : acao === "fechar" ? "Nenhum aparelho livre com a política de fechamento." : "Nada travado pela automação.",
      });
      carregar();
    } finally { setTestando(null); }
  }

  const itens = d ? checklist(d) : [];
  const prontos = itens.filter((i) => i.nivel === "ok").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pré-apresentação"
        title="Diagnóstico"
        description="Abra esta página 10 minutos antes da banca: ela confere banco, rede, VM, celular e automações — e diz o que falta."
        actions={<Button variant="secondary" size="sm" onClick={carregar} loading={carregando}><RefreshCw />Conferir de novo</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <p className="text-[13px] font-medium">Checklist</p>
            {d && <p className="text-[12px] text-muted"><span className="tabular-nums text-fg">{prontos}</span> de {itens.length} prontos</p>}
          </div>
          <ul>
            {!d && <li className="px-5 py-10 text-center text-[13px] text-subtle">Conferindo…</li>}
            {itens.map((i) => (
              <li key={i.titulo} className="flex gap-3 border-b border-line px-5 py-3 last:border-0">
                <span className="mt-0.5">{ICONE[i.nivel]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">{i.titulo}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">{i.detalhe}</p>
                </div>
                {i.link && i.nivel !== "ok" && <Link href={i.link.href} className="shrink-0 self-center text-[12px] text-accent hover:underline">{i.link.rotulo} →</Link>}
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-[13px] font-medium">Endereços desta máquina</p>
            <p className="mt-1 text-[12px] text-muted">Use um destes na VM e no celular (mesma rede). Na VM do VirtualBox em NAT, use 10.0.2.2.</p>
            <ul className="mt-3 space-y-1.5">
              {(d?.enderecos ?? []).map((e) => (
                <li key={e.ip} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5">
                  <span className="w-12 shrink-0 text-[10.5px] uppercase tracking-wider text-subtle">{e.tipo}</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{e.url}</code>
                  <button aria-label="Copiar" className="text-subtle hover:text-fg" onClick={() => { navigator.clipboard.writeText(e.url); toast.success("Copiado"); }}><Copy className="size-3.5" /></button>
                </li>
              ))}
              {d && !d.enderecos?.length && <li className="text-[12.5px] text-subtle">Nenhuma rede encontrada.</li>}
            </ul>
          </Card>

          <Card className="p-5">
            <p className="text-[13px] font-medium">Agentes reais</p>
            <ul className="mt-3 space-y-2">
              {(d?.agentes ?? []).map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className={cn("size-1.5 shrink-0 rounded-full", a.online ? "bg-ok" : "bg-subtle")} />
                  <Link href={`/dispositivos/${a.id}`} className="min-w-0 flex-1 truncate font-mono hover:underline">{a.hostname}</Link>
                  <span className="text-subtle">{a.web ? "navegador" : `agente ${a.agenteVersao}`}</span>
                  <span className="w-20 text-right text-subtle">{a.ultimoContatoEm ? tempoRelativo(a.ultimoContatoEm) : "nunca"}</span>
                </li>
              ))}
              {d && !d.agentes?.length && <li className="text-[12.5px] text-subtle">Nenhum ainda.</li>}
            </ul>
            {d?.atendimento && (
              <p className="mt-3 border-t border-line pt-3 text-[12px] text-muted">
                {d.atendimento.chamadosAbertos} pedido(s) de ajuda abertos · {d.atendimento.telasAtivas} tela(s) sendo vista(s) agora
              </p>
            )}
          </Card>

          <Card className="p-5">
            <p className="text-[13px] font-medium">Testar fechamento do espaço</p>
            <p className="mt-1 text-[12px] text-muted">
              Simula agora o que acontece às 20h: trava os aparelhos livres com a política “Travar fora do horário”. A abertura destrava só o que a automação travou.
              {d?.servidor && <> Agora o espaço está <span className="text-fg">{d.servidor.espacoAberto ? "aberto" : "fechado"}</span>.</>}
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => testar("fechar")} loading={testando === "fechar"}><Lock />Simular 20h</Button>
              <Button size="sm" variant="ghost" onClick={() => testar("abrir")} loading={testando === "abrir"}><LockOpen />Simular 8h</Button>
            </div>
          </Card>

          {d?.servidor && (
            <p className="px-1 font-mono text-[11px] text-subtle">
              node {d.servidor.node} · {d.servidor.ambiente} · ligado há {d.servidor.ligadoHaMin} min
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
