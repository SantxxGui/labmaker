"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Check, Copy, MonitorDown, Smartphone, TerminalSquare, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { OPCOES_PADRAO, VALIDADES_HORAS, VALIDADE_PADRAO_HORAS, type OpcoesInstalacao, type ValidadeHoras } from "@/lib/convite";
import { Segmented } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SO_LABEL, TIPO_DISPOSITIVO_LABEL } from "@/lib/labels";
import type { DispositivoPainelDTO, LaboratorioDTO, PoliticaDTO, SistemaOperacional, TipoDispositivo } from "@/lib/types";

/**
 * Adicionar aparelho, de três jeitos:
 *  - manual: só o cadastro (pronto para empréstimo);
 *  - agente: código curto (vale 2, 12 ou 24 h) + UM comando (Win+R no Windows, curl | sh no Linux/macOS) que
 *    baixa o agente, inscreve o computador com as opções marcadas e liga o início automático;
 *  - celular: o mesmo código num QR code que abre /agente no navegador do celular.
 * O agente troca o código por um token próprio (o servidor guarda só o hash).
 */
export function AdicionarComputadorDialog({ laboratorios, politicas, onCadastrado }: {
  laboratorios: LaboratorioDTO[]; politicas: PoliticaDTO[]; onCadastrado?: (d: DispositivoPainelDTO) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<"manual" | "agente" | "celular">("manual");
  const [servidor, setServidor] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [form, setForm] = useState({ hostname: "", tipo: "NOTEBOOK" as TipoDispositivo, so: "WINDOWS" as SistemaOperacional, fabricante: "", modelo: "", numeroSerie: "" });
  const campo = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [politicaId, setPoliticaId] = useState(politicas.find((p) => /alunos/i.test(p.nome))?.id ?? politicas[0]?.id ?? "");
  const [laboratorioId, setLaboratorioId] = useState("nenhum");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [opcoes, setOpcoes] = useState<OpcoesInstalacao>(OPCOES_PADRAO);
  const [sistema, setSistema] = useState<"windows" | "unix">("windows");
  const [comandos, setComandos] = useState<{ windows: string; unix: string; manual: string } | null>(null);
  const [validade, setValidade] = useState<ValidadeHoras>(VALIDADE_PADRAO_HORAS);
  const [validoAte, setValidoAte] = useState<Date | null>(null);
  const ateTexto = validoAte
    ? validoAte.toLocaleString("pt-BR", validoAte.toDateString() === new Date().toDateString() ? { hour: "2-digit", minute: "2-digit" } : { weekday: "short", hour: "2-digit", minute: "2-digit" })
    : "";

  // Endereço que o OUTRO aparelho usa para chegar no servidor (localhost só funciona nesta máquina)
  const origem = typeof window !== "undefined" ? window.location.origin : "";
  const porta = typeof window !== "undefined" ? window.location.port || "3000" : "3000";
  useEffect(() => { if (!servidor && origem) setServidor(origem.startsWith("http") ? origem : "http://IP-DO-SERVIDOR:3000"); }, [origem, servidor]);

  // IPs reais do servidor (Wi-Fi, cabo…) viram atalhos — e substituem o "localhost", que o outro aparelho não alcança
  const [enderecos, setEnderecos] = useState<{ ip: string; tipo: string; url: string; interface: string }[]>([]);
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    fetch("/api/sistema/enderecos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo || !j?.enderecos) return;
        setEnderecos(j.enderecos);
        const melhor = j.enderecos.find((e: { tipo: string }) => e.tipo === "wifi" || e.tipo === "cabo");
        setServidor((atual) => (melhor && /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(atual) ? melhor.url : atual));
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [aberto]);
  const base = servidor.replace(/\/$/, "");
  const ehLocal = /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(base);
  const comando = comandos ? (sistema === "windows" ? comandos.windows : comandos.unix) : "";
  const linkCelular = codigo ? `${base}/agente?codigo=${encodeURIComponent(codigo)}` : "";

  // QR code do link (gerado no navegador, sem serviço externo)
  useEffect(() => {
    if (modo !== "celular" || !linkCelular) { setQr(null); return; }
    let vivo = true;
    import("qrcode").then((q) => q.toString(linkCelular, { type: "svg", margin: 1, errorCorrectionLevel: "L" })).then((svg) => vivo && setQr(svg)).catch(() => setQr(null));
    return () => { vivo = false; };
  }, [modo, linkCelular]);

  async function gerar() {
    setGerando(true);
    try {
      const r = await fetch("/api/dispositivos/inscricao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ politicaId, laboratorioId: laboratorioId === "nenhum" ? null : laboratorioId, servidor: base, opcoes, validadeHoras: validade }),
      });
      const j = await r.json();
      if (!r.ok) return toast.error(j.error ?? "Não foi possível gerar o código.");
      setCodigo(j.codigo);
      setComandos(j.comandos);
      setValidoAte(j.validoAte ? new Date(j.validoAte) : null);
    } finally {
      setGerando(false);
    }
  }

  async function cadastrar() {
    setGerando(true);
    try {
      const r = await fetch("/api/dispositivos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, politicaId, laboratorioId: laboratorioId === "nenhum" ? null : laboratorioId }),
      });
      const j = await r.json();
      if (!r.ok) return toast.error(j.error ?? "Não foi possível cadastrar.");
      toast.success(`${j.dispositivo.hostname} cadastrado — já pode ser emprestado.`);
      onCadastrado?.(j.dispositivo);
      setForm((f) => ({ ...f, hostname: "", numeroSerie: "" }));
      setAberto(false);
    } finally {
      setGerando(false);
    }
  }

  async function copiar(texto = modo === "celular" ? linkCelular : comando) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { setAberto(o); if (!o) { setCodigo(null); setComandos(null); } }}>
      <Button variant="secondary" onClick={() => setAberto(true)}><MonitorDown />Adicionar aparelho</Button>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><TerminalSquare className="size-4 text-signal" />Adicionar aparelho do espaço</DialogTitle>
          <DialogDescription>
            {modo === "manual"
              ? "Cadastre o notebook ou tablet pelo patrimônio: ele já entra na lista de empréstimos. Depois, se quiser monitorar, instale o agente com o mesmo nome."
              : modo === "agente"
                ? "Para computadores (inclusive uma VM): um comando só instala o agente, um programa leve em Node.js que faz check-in a cada 15 s, mostra avisos, trava a tela e mostra a tela quando o usuário autoriza."
                : "Para celulares e tablets: a pessoa escaneia o QR code e o navegador vira o agente. Recebe avisos (com confirmação de leitura) e bloqueio."}
          </DialogDescription>
        </DialogHeader>

        {!codigo && (
          <Segmented value={modo} onChange={setModo} options={[{ value: "manual", label: "Cadastro manual" }, { value: "agente", label: "Computador / VM" }, { value: "celular", label: "Celular (QR code)" }]} />
        )}

        {modo === "manual" && !codigo ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome / etiqueta" htmlFor="ad-host"><Input id="ad-host" value={form.hostname} onChange={campo("hostname")} placeholder="LM-NB-01" className="font-mono" /></Field>
              <Field label="Nº de série / patrimônio" htmlFor="ad-serie"><Input id="ad-serie" value={form.numeroSerie} onChange={campo("numeroSerie")} placeholder="PAT-000123" /></Field>
              <Field label="Tipo" htmlFor="ad-tipo">
                <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as TipoDispositivo }))}>
                  <SelectTrigger id="ad-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(TIPO_DISPOSITIVO_LABEL) as TipoDispositivo[]).map((t) => <SelectItem key={t} value={t}>{TIPO_DISPOSITIVO_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Sistema" htmlFor="ad-so">
                <Select value={form.so} onValueChange={(v) => setForm((f) => ({ ...f, so: v as SistemaOperacional }))}>
                  <SelectTrigger id="ad-so"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(SO_LABEL) as SistemaOperacional[]).map((t) => <SelectItem key={t} value={t}>{SO_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Fabricante" htmlFor="ad-fab"><Input id="ad-fab" value={form.fabricante} onChange={campo("fabricante")} placeholder="Lenovo" /></Field>
              <Field label="Modelo" htmlFor="ad-mod"><Input id="ad-mod" value={form.modelo} onChange={campo("modelo")} placeholder="IdeaPad 3" /></Field>
              <Field label="Política" htmlFor="ad-pol">
                <Select value={politicaId} onValueChange={setPoliticaId}>
                  <SelectTrigger id="ad-pol"><SelectValue placeholder="Sem política" /></SelectTrigger>
                  <SelectContent>{politicas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Área do espaço" htmlFor="ad-lab">
                <Select value={laboratorioId} onValueChange={setLaboratorioId}>
                  <SelectTrigger id="ad-lab"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Balcão (sem área)</SelectItem>
                    {laboratorios.map((l) => <SelectItem key={l.id} value={l.id}>{l.codigo} · {l.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
              <Button onClick={cadastrar} loading={gerando} disabled={!form.hostname || !form.numeroSerie || !form.fabricante || !form.modelo}>Cadastrar</Button>
            </div>
          </div>
        ) : !codigo ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Política" htmlFor="ac-pol">
                <Select value={politicaId} onValueChange={setPoliticaId}>
                  <SelectTrigger id="ac-pol"><SelectValue /></SelectTrigger>
                  <SelectContent>{politicas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Área do espaço" htmlFor="ac-lab">
                <Select value={laboratorioId} onValueChange={setLaboratorioId}>
                  <SelectTrigger id="ac-lab"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Equipe (sem área)</SelectItem>
                    {laboratorios.map((l) => <SelectItem key={l.id} value={l.id}>{l.codigo} · {l.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Endereço do servidor (como o outro aparelho chega até aqui)" htmlFor="ac-srv">
              <Input id="ac-srv" value={servidor} onChange={(e) => setServidor(e.target.value)} className="font-mono text-[12.5px]" placeholder="http://192.168.0.10:3000" />
            </Field>
            <div className="-mt-1 flex flex-wrap gap-1.5 text-[11.5px]">
              <button type="button" onClick={() => setServidor(origem)} className="rounded-full border border-line px-2.5 py-1 text-muted hover:text-fg">Esta página</button>
              {enderecos.filter((e) => e.tipo !== "virtual" || modo === "agente").slice(0, 4).map((e) => (
                <button key={e.ip} type="button" onClick={() => setServidor(e.url)} title={`Interface ${e.interface}`}
                  className={cn("rounded-full border px-2.5 py-1 font-mono transition-colors", base === e.url ? "border-accent/50 bg-accent/10 text-fg" : "border-line text-muted hover:text-fg")}>
                  {e.tipo === "wifi" ? "Wi-Fi" : e.tipo === "cabo" ? "Cabo" : e.tipo === "virtual" ? "Virtual" : "Rede"} · {e.ip}
                </button>
              ))}
              {modo === "agente" && (
                <button type="button" onClick={() => setServidor(`http://10.0.2.2:${porta}`)} className="rounded-full border border-line px-2.5 py-1 text-muted hover:text-fg" title="Endereço do computador hospedeiro visto de dentro de uma VM do VirtualBox em modo NAT">
                  VM do VirtualBox (10.0.2.2)
                </button>
              )}
            </div>
            {ehLocal && (
              <p className="flex gap-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] text-warn">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {modo === "celular"
                  ? "“localhost” só funciona neste computador. Para o celular, use o IP da rede (ex.: http://192.168.0.10:3000, no mesmo Wi-Fi) ou o endereço HTTPS do túnel."
                  : "“localhost” só funciona neste computador. Numa VM do VirtualBox (NAT) use 10.0.2.2; em outro computador, o IP da rede."}
              </p>
            )}
            {modo === "agente" && (
              <div className="rounded-xl border border-line px-3 py-1.5">
                {([
                  ["bloqueio", "Bloquear a tela de verdade", "Trava o computador e trava de novo até você liberar"],
                  ["reinicio", "Reiniciar pelo painel", "Com 1 minuto de aviso na tela"],
                  ["iniciarComPc", "Iniciar junto com o computador", "E cria o atalho “Pedir ajuda ao Líder” na área de trabalho"],
                  ["politica", "Aplicar a política", "Fecha os apps proibidos e põe programas baixados em quarentena"],
                ] as const).map(([k, titulo, desc]) => (
                  <label key={k} className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
                    <span>
                      <span className="block text-[13px] text-fg">{titulo}</span>
                      <span className="block text-[11.5px] text-subtle">{desc}</span>
                    </span>
                    <Switch checked={opcoes[k]} onCheckedChange={(v) => setOpcoes((o) => ({ ...o, [k]: v }))} aria-label={titulo} />
                  </label>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[12.5px] text-muted">
                <span>O código vale</span>
                <Segmented value={String(validade)} onChange={(v) => setValidade(Number(v) as ValidadeHoras)}
                  options={VALIDADES_HORAS.map((h) => ({ value: String(h), label: h === 24 ? "1 dia" : `${h} h` }))} />
              </div>
              <Button onClick={gerar} loading={gerando} disabled={!/^https?:\/\/./.test(base)}>{modo === "celular" ? "Gerar QR code" : "Gerar código de inscrição"}</Button>
            </div>
          </div>
        ) : modo === "celular" ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="grid size-52 shrink-0 place-items-center rounded-xl bg-white p-2" aria-label="QR code para conectar o celular">
                {qr ? <div className="size-full [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} /> : <Smartphone className="size-8 text-zinc-400" />}
              </div>
              <ol className="space-y-2 text-[13px] text-muted">
                <li><span className="font-medium text-fg">1.</span> No celular, abra a câmera e aponte para o QR code.</li>
                <li><span className="font-medium text-fg">2.</span> Na página que abrir, a pessoa digita o nome dela e toca em <span className="text-fg">Conectar</span>.</li>
                <li><span className="font-medium text-fg">3.</span> O celular aparece nesta lista como <span className="font-mono text-fg">CEL-NOME</span>, com o selo <span className="text-ok">real</span>. Deixe a página aberta no celular.</li>
              </ol>
            </div>
            <div className="relative rounded-xl border border-line-strong bg-black/50 p-3 pr-12">
              <code className="block max-h-20 overflow-auto break-all font-mono text-[11px] leading-relaxed text-muted">{linkCelular}</code>
              <button onClick={() => copiar()} aria-label="Copiar link" className="absolute right-2 top-2 grid size-8 place-items-center rounded-md text-subtle hover:bg-white/10 hover:text-fg">
                {copiado ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
              </button>
            </div>
            <p className="text-[12px] text-subtle">
              O celular precisa alcançar <span className="font-mono text-muted">{base}</span>. Pelo navegador ele recebe avisos e bloqueio; ver a tela de um celular não é possível sem um sistema de gerenciamento (MDM).
            </p>
            <div className="flex justify-end"><Button variant="ghost" onClick={() => setAberto(false)}>Fechar</Button></div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-white/[0.03] px-4 py-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-subtle">Código</p>
                <p className="font-mono text-2xl font-semibold tracking-[0.25em] text-fg" data-codigo>{codigo}</p>
              </div>
              <p className="max-w-[15rem] text-right text-[12px] text-subtle">Vale até <span className="text-muted">{ateTexto}</span> e serve para quantos computadores você quiser.</p>
            </div>
            <Segmented value={sistema} onChange={setSistema} options={[{ value: "windows", label: "Windows" }, { value: "unix", label: "Linux / macOS" }]} />
            <p className="text-[13px] text-muted">
              {sistema === "windows"
                ? <>No computador, aperte <Tecla>Win</Tecla> + <Tecla>R</Tecla> (ou abra o Prompt de Comando), cole e dê <Tecla>Enter</Tecla>:</>
                : <>No terminal do computador, cole e dê <Tecla>Enter</Tecla>:</>}
            </p>
            <div className="relative rounded-xl border border-line-strong bg-black/50 p-3 pr-12">
              <code className="block break-all font-mono text-[12.5px] leading-relaxed text-fg" data-comando>{comando}</code>
              <button onClick={() => copiar()} aria-label="Copiar comando" className="absolute right-2 top-2 grid size-8 place-items-center rounded-md text-subtle hover:bg-white/10 hover:text-fg">
                {copiado ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
              </button>
            </div>
            <p className="text-[12px] text-subtle">
              Em segundos o computador aparece nesta lista com o selo <span className="text-ok">Agente real</span>.
              {" "}Ligado: {[opcoes.bloqueio && "bloqueio", opcoes.reinicio && "reinício", opcoes.iniciarComPc && "iniciar com o computador", opcoes.politica && "aplicar a política"].filter(Boolean).join(", ") || "só monitoramento"}.
              {" "}Precisa do Node.js: {sistema === "windows" ? "se faltar, o comando instala sozinho (aceite o aviso do Windows)." : "instale antes (nodejs.org ou sudo apt install nodejs)."}
            </p>
            <details className="text-[12px] text-subtle">
              <summary className="cursor-pointer text-muted hover:text-fg">Sem PowerShell ou sem internet no computador? Jeito manual</summary>
              <p className="mt-2">Baixe <span className="font-mono text-muted">{base}/api/agente/script</span> como <span className="font-mono text-muted">agente.mjs</span> e rode na mesma pasta:</p>
              <code className="mt-1.5 block break-all rounded-lg border border-line bg-black/40 px-2.5 py-1.5 font-mono text-[11.5px] text-fg">
                {comandos?.manual} {[opcoes.bloqueio && "--permitir-bloqueio", opcoes.reinicio && "--permitir-reinicio", opcoes.politica && "--aplicar-politica", opcoes.iniciarComPc && "--instalar-servico"].filter(Boolean).join(" ")}
              </code>
            </details>
            <div className="flex justify-end"><Button variant="ghost" onClick={() => setAberto(false)}>Fechar</Button></div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Tecla({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-white/5 px-1.5 py-0.5 font-mono text-[11.5px] text-fg">{children}</kbd>;
}
