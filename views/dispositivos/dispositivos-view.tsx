"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, Ban, Download, Lock, Megaphone, MonitorSmartphone, Radio, ShieldCheck, ShieldX, Usb, X } from "lucide-react";
import { Anel, NumeroAnimado, Surgir } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, PageHeader, SearchInput, Segmented } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SO_LABEL, TIPO_DISPOSITIVO_LABEL } from "@/lib/labels";
import type { DispositivoPainelDTO, EmprestimoDTO, EventoDispositivoDTO, LaboratorioDTO, LoteAlertaDTO, PoliticaDTO, TipoDispositivo } from "@/lib/types";
import { cn, tempoRelativo } from "@/lib/utils";
import { BarraUso, ConformidadeChip, ICONE_DISPOSITIVO, IconeDispositivo, PRIORIDADE, StatusDispositivo } from "@/views/dispositivos/dispositivo-ui";
import { AdicionarComputadorDialog } from "@/views/dispositivos/adicionar-computador-dialog";
import { EmprestimosCard } from "@/views/dispositivos/emprestimos-card";
import { EnviarAlertaDialog } from "@/views/dispositivos/enviar-alerta-dialog";

type Filtro = "todos" | "online" | "risco" | "bloqueados";

const ICONE_EVENTO: Record<string, React.ElementType> = {
  DOWNLOAD_BLOQUEADO: Download, USB_BLOQUEADO: Usb, SITE_BLOQUEADO: Ban, APP_BLOQUEADO: ShieldX, CONFORMIDADE: AlertTriangle,
  BLOQUEIO: Lock, APAGAMENTO: ShieldX,
};
const COR_SEV = { INFO: "text-info", AVISO: "text-warn", CRITICO: "text-danger" } as const;

export function DispositivosView({ inicial, laboratorios, eventosIniciais, lotesIniciais, emprestimosIniciais, alunos, politicas, podeComandar, podePoliticas, podeEmprestar, podeCadastrar }: {
  inicial: DispositivoPainelDTO[];
  emprestimosIniciais: EmprestimoDTO[];
  alunos: { id: string; nome: string; matricula: string | null }[];
  politicas: PoliticaDTO[];
  podeEmprestar: boolean;
  podeCadastrar: boolean;
  laboratorios: LaboratorioDTO[];
  eventosIniciais: EventoDispositivoDTO[];
  lotesIniciais: LoteAlertaDTO[];
  podeComandar: boolean;
  podePoliticas: boolean;
}) {
  const [dispositivos, setDispositivos] = useState(inicial);
  const [eventos, setEventos] = useState(eventosIniciais);
  const [lotes, setLotes] = useState(lotesIniciais);
  const [emprestimos, setEmprestimos] = useState(emprestimosIniciais);
  const recarregarEmprestimos = () => {
    fetch("/api/emprestimos", { cache: "no-store" }).then((r) => r.json()).then((j) => j.emprestimos && setEmprestimos(j.emprestimos)).catch(() => {});
    fetch("/api/dispositivos", { cache: "no-store" }).then((r) => r.json()).then((j) => j.dispositivos && setDispositivos(j.dispositivos)).catch(() => {});
  };
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [tipo, setTipo] = useState<"todos" | TipoDispositivo>("todos");
  const [busca, setBusca] = useState("");
  const [selecao, setSelecao] = useState<Set<string>>(new Set());

  // Polling: alertas a cada 2 s, frota a cada 4 s, eventos a cada 8 s
  useEffect(() => {
    let vivo = true;
    let n = 0;
    const id = setInterval(async () => {
      n++;
      try {
        const [d, l] = await Promise.all([
          n % 2 === 0 || n === 1 ? fetch("/api/dispositivos", { cache: "no-store" }).then((r) => r.json()) : null,
          fetch("/api/dispositivos/alertas", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (!vivo) return;
        if (d?.dispositivos) setDispositivos(d.dispositivos);
        if (l?.lotes) setLotes(l.lotes);
        if (n % 4 === 0) {
          const [e, em] = await Promise.all([
            fetch("/api/dispositivos/eventos", { cache: "no-store" }).then((r) => r.json()),
            fetch("/api/emprestimos", { cache: "no-store" }).then((r) => r.json()),
          ]);
          if (vivo && e?.eventos) setEventos(e.eventos);
          if (vivo && em?.emprestimos) setEmprestimos(em.emprestimos);
        }
      } catch {}
    }, 2000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);

  const online = dispositivos.filter((d) => d.leitura.online).length;
  const emRisco = dispositivos.filter((d) => !d.conformidade.conforme).length;
  const bloqueados = dispositivos.filter((d) => d.bloqueado).length;
  const avaliados = dispositivos.filter((d) => !d.conformidade.semAgente);
  const confMedia = avaliados.length ? avaliados.reduce((s, d) => s + d.conformidade.pontuacao, 0) / avaliados.length : 0;
  const bloqueios24h = eventos.filter((e) => /BLOQUEADO/.test(e.tipo) && Date.now() - new Date(e.criadoEm).getTime() < 86_400_000).length;
  const porTipo = (t: TipoDispositivo) => dispositivos.filter((d) => d.tipo === t).length;

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return dispositivos.filter((d) => {
      if (filtro === "online" && !d.leitura.online) return false;
      if (filtro === "risco" && d.conformidade.conforme) return false;
      if (filtro === "bloqueados" && !d.bloqueado) return false;
      if (tipo !== "todos" && d.tipo !== tipo) return false;
      return !q || [d.hostname, d.responsavel?.nome, d.modelo, d.enderecoIp, d.laboratorio?.codigo, SO_LABEL[d.so]].some((v) => v?.toLowerCase().includes(q));
    });
  }, [dispositivos, filtro, tipo, busca]);

  const alternar = (id: string) => setSelecao((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todosMarcados = visiveis.length > 0 && visiveis.every((d) => selecao.has(d.id));

  const botaoAlerta = (
    <Button className="reflexo"><Megaphone />Enviar alerta</Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Espaço maker · computadores"
        title="Notebooks e computadores"
        description="Notebooks de empréstimo, estações das máquinas e tablets do espaço: quem está usando, o que está aberto, segurança, avisos e ações remotas."
        actions={
          <div className="flex gap-2">
            {podeCadastrar && <AdicionarComputadorDialog laboratorios={laboratorios} politicas={politicas} onCadastrado={(d) => setDispositivos((l) => [...l, d].sort((a, b) => a.hostname.localeCompare(b.hostname)))} />}
            <Button asChild variant="secondary"><Link href="/dispositivos/politicas"><ShieldCheck />{podePoliticas ? "Editar políticas" : "Políticas"}</Link></Button>
            {podeComandar && (
              <EnviarAlertaDialog laboratorios={laboratorios} selecionados={[...selecao]} total={dispositivos.length} trigger={botaoAlerta}
                onEnviado={() => fetch("/api/dispositivos/alertas").then((r) => r.json()).then((l) => setLotes(l.lotes))} />
            )}
          </div>
        }
      />

      {/* ── Indicadores ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Surgir i={0} className="glass rounded-2xl border border-line p-5">
          <p className="eyebrow">Dispositivos gerenciados</p>
          <p className="mt-3 text-[34px] font-semibold leading-none tracking-[-0.04em]"><NumeroAnimado valor={dispositivos.length} /></p>
          <div className="mt-3 flex gap-3 text-xs text-muted">
            {(["NOTEBOOK", "DESKTOP", "TABLET", "SMARTPHONE"] as const).map((t) => {
              const I = ICONE_DISPOSITIVO[t];
              return <span key={t} className="flex items-center gap-1" title={TIPO_DISPOSITIVO_LABEL[t]}><I className="size-3.5" />{porTipo(t)}</span>;
            })}
          </div>
        </Surgir>
        <Surgir i={1} className="glass rounded-2xl border border-line p-5">
          <p className="eyebrow flex items-center gap-2"><span className="ao-vivo size-1.5 rounded-full bg-ok text-ok" />Online agora</p>
          <p className="mt-3 flex items-baseline gap-1.5"><span className="text-[34px] font-semibold leading-none tracking-[-0.04em]"><NumeroAnimado valor={online} /></span><span className="text-sm text-subtle">/ {dispositivos.length}</span></p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <motion.div className="h-full rounded-full bg-ok" initial={{ width: 0 }} animate={{ width: `${(online / Math.max(1, dispositivos.length)) * 100}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        </Surgir>
        <Surgir i={2} className="glass flex items-center justify-between gap-3 rounded-2xl border border-line p-5">
          <div>
            <p className="eyebrow">Conformidade</p>
            <p className="mt-3 text-[34px] font-semibold leading-none tracking-[-0.04em]"><NumeroAnimado valor={Math.round(confMedia)} sufixo="%" /></p>
            <p className="mt-3 text-xs text-muted"><span className={emRisco ? "text-warn" : ""}>{emRisco} fora da política</span></p>
          </div>
          <Anel valor={confMedia} tamanho={68} cor={confMedia >= 90 ? "var(--ok)" : "var(--warn)"}>
            <ShieldCheck className="size-5 text-muted" />
          </Anel>
        </Surgir>
        <Surgir i={3} className={cn("glass rounded-2xl border p-5", bloqueados ? "border-signal/30" : "border-line")}>
          <p className="eyebrow">Bloqueios nas últimas 24 h</p>
          <p className="mt-3 text-[34px] font-semibold leading-none tracking-[-0.04em]"><NumeroAnimado valor={bloqueios24h} /></p>
          <p className="mt-3 text-xs text-muted">downloads, USB, sites e apps · {bloqueados} dispositivo{bloqueados === 1 ? "" : "s"} travado{bloqueados === 1 ? "" : "s"}</p>
        </Surgir>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Frota ── */}
        <div className="min-w-0 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Segmented value={filtro} onChange={setFiltro} options={[
              { value: "todos", label: "Todos", count: dispositivos.length },
              { value: "online", label: "Online", count: online },
              { value: "risco", label: "Fora da política", count: emRisco },
              { value: "bloqueados", label: "Bloqueados", count: bloqueados },
            ]} />
            <div className="flex gap-2">
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                <SelectTrigger className="h-8 w-36 text-[13px]" aria-label="Tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {(Object.keys(TIPO_DISPOSITIVO_LABEL) as TipoDispositivo[]).map((t) => <SelectItem key={t} value={t}>{TIPO_DISPOSITIVO_LABEL[t]}</SelectItem>)}
                </SelectContent>
              </Select>
              <SearchInput value={busca} onChange={setBusca} placeholder="Host, usuário, IP…" />
            </div>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[13.5px]">
                <thead>
                  <tr className="text-left font-mono text-[10.5px] uppercase tracking-[0.1em] text-subtle">
                    {podeComandar && (
                      <th className="w-10 py-2.5 pl-5">
                        <input type="checkbox" aria-label="Selecionar todos" checked={todosMarcados} onChange={() => setSelecao(todosMarcados ? new Set() : new Set(visiveis.map((d) => d.id)))} className="accent-white" />
                      </th>
                    )}
                    <th className="px-4 py-2.5 font-normal">Dispositivo</th>
                    <th className="px-4 py-2.5 font-normal">Usuário · local</th>
                    <th className="px-4 py-2.5 font-normal">Estado</th>
                    <th className="w-36 px-4 py-2.5 font-normal">CPU · memória</th>
                    <th className="px-4 py-2.5 font-normal">Segurança</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((d, i) => (
                    <motion.tr
                      key={d.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i, 15) * 0.025 }}
                      className={cn("group border-t border-line transition-colors hover:bg-white/[0.025]", selecao.has(d.id) && "bg-white/[0.04]")}
                    >
                      {podeComandar && (
                        <td className="py-3 pl-5"><input type="checkbox" aria-label={`Selecionar ${d.hostname}`} checked={selecao.has(d.id)} onChange={() => alternar(d.id)} className="accent-white" /></td>
                      )}
                      <td className="px-4 py-3">
                        <Link href={`/dispositivos/${d.id}`} className="flex items-center gap-3">
                          <IconeDispositivo tipo={d.tipo} className={cn(d.bloqueado && "border-signal/40 text-signal")} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 font-mono text-[13px] text-fg group-hover:underline">
                              {d.hostname}
                              {d.agenteReal && <span title="Agente real instalado neste computador" className="rounded border border-ok/30 bg-ok-soft px-1 font-sans text-[9.5px] font-medium uppercase tracking-wide text-ok no-underline">real</span>}
                            </span>
                            <span className="block truncate text-xs text-subtle">{SO_LABEL[d.so]} · {d.fabricante} {d.modelo}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <p className="truncate text-fg">{d.responsavel?.nome ?? <span className="text-muted">{d.tipo === "TABLET" ? "Quiosque" : d.tipo === "DESKTOP" ? "Estação da máquina" : "No balcão (disponível)"}</span>}</p>
                        <p className="font-mono text-[11px] text-subtle">{d.laboratorio ? `${d.laboratorio.codigo} · ` : "Equipe · "}{d.enderecoIp}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusDispositivo online={d.leitura.online} bloqueado={d.bloqueado} />
                        <p className="mt-1 truncate text-[11px] text-subtle">
                          {d.leitura.online ? (d.leitura.appAtivo ?? (d.bloqueado ? "tela de bloqueio" : "ocioso")) : d.ultimoContatoEm ? `visto ${tempoRelativo(d.ultimoContatoEm)}` : "sem agente instalado"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {d.leitura.online ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2"><BarraUso valor={d.leitura.cpu} className="w-16" /><span className="w-8 text-right font-mono text-[11px] text-muted">{d.leitura.cpu}%</span></div>
                            <div className="flex items-center gap-2"><BarraUso valor={d.leitura.memoria} className="w-16" /><span className="w-8 text-right font-mono text-[11px] text-muted">{d.leitura.memoria}%</span></div>
                          </div>
                        ) : <span className="text-xs text-subtle">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <ConformidadeChip pontuacao={d.conformidade.pontuacao} conforme={d.conformidade.conforme} semAgente={d.conformidade.semAgente} />
                        {!d.conformidade.conforme && !d.conformidade.semAgente && (
                          <p className="mt-1 max-w-[180px] truncate text-[11px] text-subtle">{d.conformidade.itens.filter((x) => !x.ok).map((x) => x.rotulo).join(" · ")}</p>
                        )}
                      </td>
                      <td className="pr-4"><Link href={`/dispositivos/${d.id}`} aria-label="Abrir"><ArrowUpRight className="size-4 text-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" /></Link></td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visiveis.length === 0 && (
              <p className="py-14 text-center text-sm text-muted">
                {dispositivos.length === 0
                  ? (podeCadastrar ? "Nenhum aparelho ainda. Use “Adicionar aparelho” para cadastrar os notebooks do espaço." : "O Líder do espaço ainda não cadastrou nenhum aparelho.")
                  : "Nenhum dispositivo com esse filtro."}
              </p>
            )}
          </Card>
        </div>

        {/* ── Coluna lateral ── */}
        <div className="min-w-0 space-y-4">
          <EmprestimosCard emprestimos={emprestimos} dispositivos={dispositivos} alunos={alunos} podeGerenciar={podeEmprestar} onMudou={recarregarEmprestimos} />

          <Card className="overflow-hidden">
            <CardHeader title="Alertas enviados" description="Confirmações de leitura em tempo real" />
            <ul>
              {lotes.length === 0 && <li className="px-5 pb-6 text-sm text-muted">Nenhum alerta nos últimos 30 dias.</li>}
              {lotes.slice(0, 4).map((l) => (
                <li key={l.lote} className="border-t border-line px-5 py-3.5 first:border-t-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-[13px] font-medium leading-snug text-fg">{l.titulo}</p>
                    <span className={cn("shrink-0 rounded-full border px-2 text-[10px] leading-5", PRIORIDADE[l.prioridade].classe)}>{PRIORIDADE[l.prioridade].rotulo}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-subtle">{l.autor.split(" ")[0]} · {tempoRelativo(l.criadoEm)}</p>
                  <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <motion.div className="h-full bg-ok" animate={{ width: `${(l.lidos / l.total) * 100}%` }} transition={{ duration: 0.6 }} />
                    <motion.div className="h-full bg-info/70" animate={{ width: `${(l.entregues / l.total) * 100}%` }} transition={{ duration: 0.6 }} />
                  </div>
                  <p className="mt-1.5 flex gap-3 font-mono text-[10.5px] text-subtle">
                    <span className="text-ok">{l.lidos} lidos</span><span className="text-info">{l.entregues} entregues</span><span>{l.pendentes} na fila</span><span className="ml-auto">{l.total}</span>
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title={<span className="flex items-center gap-2"><Radio className="size-4 text-ok led-pulse" />Eventos dos agentes</span>} description="Bloqueios e alertas de segurança" />
            <ul className="max-h-[420px] overflow-y-auto">
              <AnimatePresence initial={false}>
                {eventos.slice(0, 14).map((e) => {
                  const I = ICONE_EVENTO[e.tipo] ?? MonitorSmartphone;
                  return (
                    <motion.li key={e.id} layout initial={{ opacity: 0, x: -12, backgroundColor: "rgba(245,158,11,0.12)" }} animate={{ opacity: 1, x: 0, backgroundColor: "rgba(0,0,0,0)" }} transition={{ duration: 0.8 }}
                      className="flex gap-3 border-t border-line px-5 py-3 first:border-t-0">
                      <I className={cn("mt-0.5 size-4 shrink-0", COR_SEV[e.severidade])} />
                      <div className="min-w-0">
                        <p className="text-[12.5px] leading-snug text-fg">{e.descricao}</p>
                        <p className="mt-0.5 text-[11px] text-subtle">
                          <Link href={`/dispositivos/${e.dispositivo.id}`} className="font-mono hover:text-fg">{e.dispositivo.hostname}</Link> · {tempoRelativo(e.criadoEm)}
                        </p>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </Card>
        </div>
      </div>

      {/* ── Barra de seleção ── */}
      <AnimatePresence>
        {podeComandar && selecao.size > 0 && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", bounce: 0.25 }}
            className="glass fixed inset-x-0 bottom-16 z-40 mx-auto flex w-fit items-center gap-3 rounded-2xl border border-line-strong px-4 py-2.5 shadow-pop">
            <span className="text-sm"><span className="font-semibold tabular-nums">{selecao.size}</span> selecionado{selecao.size > 1 ? "s" : ""}</span>
            <EnviarAlertaDialog laboratorios={laboratorios} selecionados={[...selecao]} total={dispositivos.length}
              trigger={<Button size="sm"><Megaphone />Alertar selecionados</Button>}
              onEnviado={() => fetch("/api/dispositivos/alertas").then((r) => r.json()).then((l) => setLotes(l.lotes))} />
            <button onClick={() => setSelecao(new Set())} aria-label="Limpar seleção" className="grid size-7 place-items-center rounded-md text-subtle hover:bg-white/10 hover:text-fg"><X className="size-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
