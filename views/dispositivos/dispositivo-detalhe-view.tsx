"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, BellRing, Check, Download, Eraser, Lock, LockOpen, MonitorUp, Package, PackageX, Plus, RefreshCw, RotateCcw, ShieldCheck, Trash2, Usb, X, Minus, MessageSquare } from "lucide-react";
import { Anel, NumeroAnimado, Surgir } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { APP_AGENTE, CATEGORIAS_SITE, catalogoPara } from "@/lib/agente";
import { ACAO_DISPOSITIVO_LABEL, MODO_DOWNLOAD_LABEL, SO_LABEL, TIPO_DISPOSITIVO_LABEL } from "@/lib/labels";
import type { AcaoDispositivoDTO, DispositivoPainelDTO, EmprestimoDTO, EventoDispositivoDTO, PoliticaDTO, SeveridadeAlarme, TipoAcaoDispositivo } from "@/lib/types";
import { cn, formatDataHora, tempoRelativo } from "@/lib/utils";
import { BarraUso, IconeDispositivo, PRIORIDADE, StatusAcaoChip, StatusDispositivo, TelaDispositivo, type Notificacao } from "@/views/dispositivos/dispositivo-ui";
import { TelaRemotaAoVivo } from "@/views/dispositivos/tela-remota-ao-vivo";

type Props = {
  inicial: DispositivoPainelDTO;
  acoesIniciais: AcaoDispositivoDTO[];
  eventosIniciais: EventoDispositivoDTO[];
  politica: PoliticaDTO | null;
  emprestimos: EmprestimoDTO[];
  podeComandar: boolean;
  podeApagar: boolean;
};

type Pedido = { tipo: TipoAcaoDispositivo; parametro?: string };

export function DispositivoDetalheView(p: Props) {
  const [d, setD] = useState(p.inicial);
  const [acoes, setAcoes] = useState(p.acoesIniciais);
  const [eventos, setEventos] = useState(p.eventosIniciais);
  const [abrindoConversa, setAbrindoConversa] = useState(false);
  async function conversar() {
    setAbrindoConversa(true);
    try {
      const r = await fetch(`/api/dispositivos/${d.id}/atendimento`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) return toast.error(j.error ?? "Não foi possível abrir o atendimento.");
      window.location.href = `/atendimento?chamado=${j.chamado.id}`;
    } finally { setAbrindoConversa(false); }
  }
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [notificacao, setNotificacao] = useState<(Notificacao & { chave: string }) | null>(null);
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [sessaoEncerrada, setSessaoEncerrada] = useState(false);

  async function recarregar() {
    try {
      const r = await fetch(`/api/dispositivos/${d.id}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setD(j.dispositivo);
      setAcoes(j.acoes);
      setEventos(j.eventos);
    } catch {}
  }
  useEffect(() => {
    const id = setInterval(recarregar, 2500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id]);

  // Estado da sessão remota iniciada nesta tela
  const acaoSessao = acoes.find((a) => a.id === sessaoId);
  const sessao = sessaoEncerrada || !acaoSessao ? null : acaoSessao.status === "EXECUTADA" ? "ativa" : acaoSessao.status === "RECUSADA" ? null : "aguardando";

  async function enviar(corpo: Record<string, unknown>) {
    setEnviando(true);
    try {
      const r = await fetch(`/api/dispositivos/${d.id}/acoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const j = await r.json();
      if (!r.ok) {
        toast.error("Ação recusada", { description: j.error });
        return false;
      }
      const tipo = corpo.tipo as TipoAcaoDispositivo;
      toast.success(`${ACAO_DISPOSITIVO_LABEL[tipo]} enviado`, {
        description: j.enfileirada ? `${d.hostname} está offline: a ação fica na fila até o próximo check-in.` : `${d.hostname} · o agente confirma em segundos`,
      });
      if (tipo === "ALERTA" && !j.enfileirada) {
        setNotificacao({ titulo: String(corpo.titulo), mensagem: String(corpo.mensagem), prioridade: corpo.prioridade as SeveridadeAlarme, chave: j.acao.id });
        setTimeout(() => setNotificacao((n) => (n?.chave === j.acao.id ? null : n)), 7000);
      }
      if (tipo === "SESSAO_REMOTA") {
        setSessaoId(j.acao.id);
        setSessaoEncerrada(false);
      }
      setD(j.dispositivo);
      await recarregar();
      return true;
    } catch {
      toast.error("Falha de comunicação.");
      return false;
    } finally {
      setEnviando(false);
    }
  }

  const l = d.leitura;
  const catalogo = useMemo(
    () => catalogoPara(d.so).filter((a) => !d.appsInstalados.includes(a.nome) && !(d.politica?.appsBloqueados ?? []).includes(a.nome)),
    [d.so, d.appsInstalados, d.politica],
  );

  const ACOES: { tipo: TipoAcaoDispositivo; icone: React.ElementType; texto: string; perigo?: boolean; oculto?: boolean }[] = [
    { tipo: "ALERTA", icone: BellRing, texto: "Mostrar uma mensagem na tela" },
    d.bloqueado
      ? { tipo: "DESBLOQUEAR", icone: LockOpen, texto: "Liberar o uso do dispositivo" }
      : { tipo: "BLOQUEAR", icone: Lock, texto: "Travar a tela até o Líder liberar" },
    { tipo: "SESSAO_REMOTA", icone: MonitorUp, texto: "Ver a tela, com autorização do usuário" },
    { tipo: "INSTALAR_APP", icone: Package, texto: "Instalar do catálogo aprovado" },
    { tipo: "REINICIAR", icone: RotateCcw, texto: "Reiniciar o sistema" },
    { tipo: "SINCRONIZAR", icone: RefreshCw, texto: "Reaplicar política agora" },
    { tipo: "APAGAR_DADOS", icone: Eraser, texto: "Perda ou roubo: apagar dados", perigo: true, oculto: !p.podeApagar },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dispositivos" className="inline-flex items-center gap-1.5 text-[13px] text-subtle transition-colors hover:text-fg">
          <ArrowLeft className="size-3.5" /> Central de dispositivos
        </Link>
        <Surgir className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-4">
            <IconeDispositivo tipo={d.tipo} className="size-12 rounded-xl [&_svg]:size-5" />
            <div className="min-w-0">
              <p className="eyebrow">{TIPO_DISPOSITIVO_LABEL[d.tipo]} · {d.laboratorio ? `${d.laboratorio.codigo} · ${d.laboratorio.unidadeSigla}` : "Balcão do espaço"}</p>
              <h1 className="mt-1.5 font-mono text-[26px] font-semibold leading-tight tracking-[-0.02em]">{d.hostname}</h1>
              <p className="mt-1 text-sm text-muted">{d.fabricante} {d.modelo} · {d.versaoSo}</p>
              <p className="mt-1.5 text-[11px]">
                {d.agenteReal
                  ? <span className="rounded border border-ok/30 bg-ok-soft px-1.5 py-0.5 font-medium text-ok">Agente real · dados medidos no computador</span>
                  : <span className="rounded border border-line px-1.5 py-0.5 text-subtle">Agente simulado (demonstração)</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusDispositivo online={l.online} bloqueado={d.bloqueado} className="h-8 px-3 text-[13px]" />
            <span className="glass inline-flex h-8 items-center rounded-full border border-line px-3 text-xs text-muted">
              {d.responsavel ? d.responsavel.nome : d.tipo === "TABLET" ? "Quiosque" : d.tipo === "DESKTOP" ? "Estação da máquina" : "No balcão (disponível)"}
            </span>
            {d.agenteReal && p.podeComandar && (
              <Button size="sm" variant="secondary" onClick={conversar} loading={abrindoConversa}><MessageSquare />Conversar</Button>
            )}
          </div>
        </Surgir>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
        <div className="min-w-0 space-y-4">
          {/* Tela */}
          <Surgir i={1}>
            {d.agenteReal ? (
              <Card className="overflow-hidden p-0">
                <TelaRemotaAoVivo dispositivoId={d.id} hostname={d.hostname} online={l.online} podeComandar={p.podeComandar} onPedir={() => setPedido({ tipo: "SESSAO_REMOTA" })} />
              </Card>
            ) : (
            <Card className="overflow-hidden p-0">
              <div className={cn("p-4", d.tipo === "TABLET" || d.tipo === "SMARTPHONE" ? "bg-black/30" : "p-0")}>
                <TelaDispositivo tipo={d.tipo} online={l.online} bloqueado={d.bloqueado} appAtivo={l.appAtivo} usuario={l.usuarioSessao} notificacao={notificacao} sessao={sessao} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[11.5px]">
                <span className="font-mono text-subtle">
                  {sessao === "ativa" ? "transmitindo · sessão autorizada pelo usuário" : "visualização simulada · a tela real só é transmitida durante o suporte remoto"}
                </span>
                {sessao === "ativa" && (
                  <Button size="sm" variant="danger" onClick={() => { setSessaoEncerrada(true); toast("Sessão remota encerrada", { description: "Registro mantido na auditoria." }); }}>
                    <X />Encerrar sessão
                  </Button>
                )}
              </div>
            </Card>
            )}
          </Surgir>

          {/* Telemetria */}
          <Surgir i={2} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {([
              ["CPU", l.cpu],
              ["Memória", l.memoria],
              ["Disco", l.disco],
              [d.tipo === "DESKTOP" ? "Energia" : "Bateria", l.bateria],
            ] as const).map(([rot, v], i) => (
              <div key={rot} className="glass rounded-2xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-muted">{rot}</p>
                  {i === 3 && l.carregando && <span className="text-[10.5px] text-ok">carregando</span>}
                </div>
                <p className="mt-2 font-mono text-[24px] font-medium leading-none">
                  {v === null ? (i === 3 && d.tipo === "DESKTOP" && l.online ? <span className="text-[15px] text-muted">tomada</span> : "—") : <><NumeroAnimado valor={v} duracao={0.6} /><span className="text-[13px] text-subtle">%</span></>}
                </p>
                {i === 3 ? (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <div className={cn("h-full rounded-full transition-[width] duration-700", v !== null && v < 20 ? "bg-danger" : "bg-ok")} style={{ width: `${v ?? (d.tipo === "DESKTOP" && l.online ? 100 : 0)}%` }} />
                  </div>
                ) : <BarraUso valor={v} className="mt-3" />}
              </div>
            ))}
          </Surgir>

          <Surgir i={3}>
            <Card className="p-5">
              <p className="eyebrow">Rede e sistema</p>
              <dl className="mt-4 grid gap-x-8 gap-y-2.5 text-[13px] sm:grid-cols-2">
                {[
                  ["Endereço IP", d.enderecoIp ?? "—"],
                  ["MAC", d.enderecoMac ?? "—"],
                  ["Conexão", l.rede ?? "—"],
                  ["Último check-in", l.ultimoContatoEm ? tempoRelativo(l.ultimoContatoEm) : "nunca"],
                  ["Sessão", l.usuarioSessao ?? "—"],
                  ["Em uso agora", l.appAtivo ?? "—"],
                  ["Ligado há", l.uptimeH !== null ? `${l.uptimeH} h` : "—"],
                  ["Agente", `v${d.agenteVersao}`],
                  ["Nº de série", d.numeroSerie],
                  ["Armazenamento", `${d.armazenamentoGb} GB`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-line/60 pb-2">
                    <dt className="text-subtle">{k}</dt>
                    <dd className={cn("truncate text-right font-mono text-[12.5px]", k === "Último check-in" && !l.online ? "text-danger" : "text-fg")}>{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </Surgir>
        </div>

        {/* Coluna de ações */}
        <div className="min-w-0 space-y-4">
          <Surgir i={1}>
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="eyebrow">Ações remotas</p>
                {!p.podeComandar && <span className="text-[11px] text-subtle">somente leitura</span>}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {ACOES.filter((a) => !a.oculto).map(({ tipo, icone: I, texto, perigo }) => (
                  <motion.button
                    key={tipo}
                    whileHover={p.podeComandar ? { y: -2 } : undefined}
                    whileTap={p.podeComandar ? { scale: 0.97 } : undefined}
                    disabled={!p.podeComandar || enviando}
                    onClick={() => setPedido({ tipo })}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      perigo ? "col-span-2 border-danger/30 bg-danger-soft/40 hover:bg-danger-soft" : "border-line bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.06]",
                    )}
                  >
                    <I className={cn("size-4", perigo ? "text-danger" : "text-fg")} />
                    <span>
                      <span className="block text-[13px] font-medium text-fg">{ACAO_DISPOSITIVO_LABEL[tipo]}</span>
                      <span className="block text-[11px] leading-snug text-subtle">{texto}</span>
                    </span>
                  </motion.button>
                ))}
              </div>
            </Card>
          </Surgir>

          {/* Conformidade */}
          <Surgir i={2}>
            <Card className="p-5">
              <div className="flex items-center gap-4">
                <Anel valor={d.conformidade.pontuacao} tamanho={60} cor={d.conformidade.semAgente ? "var(--subtle)" : d.conformidade.conforme ? "var(--ok)" : d.conformidade.pontuacao >= 70 ? "var(--warn)" : "var(--danger)"}>
                  <span className="font-mono text-[13px]">{d.conformidade.pontuacao}</span>
                </Anel>
                <div>
                  <p className="eyebrow">Conformidade</p>
                  <p className={cn("mt-1 text-[15px] font-semibold", d.conformidade.semAgente ? "text-muted" : d.conformidade.conforme ? "text-ok" : "text-warn")}>
                    {d.conformidade.semAgente ? "Sem agente instalado" : d.conformidade.conforme ? "Dentro da política" : `${d.conformidade.itens.filter((i) => !i.ok).length} item(ns) fora da política`}
                  </p>
                </div>
              </div>
              <ul className="mt-4 space-y-2">
                {d.conformidade.itens.map((i, k) => (
                  <motion.li key={i.chave} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + k * 0.04 }} className="flex items-center gap-2.5 text-[13px]">
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full", i.neutro ? "bg-white/5 text-subtle" : i.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>
                      {i.neutro ? <Minus className="size-3" strokeWidth={3} /> : i.ok ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate", i.neutro ? "text-muted" : "text-fg")}>{i.rotulo}</span>
                    <span className={cn("shrink-0 text-[11.5px]", i.ok ? "text-subtle" : "text-danger")}>{i.detalhe}</span>
                  </motion.li>
                ))}
              </ul>
            </Card>
          </Surgir>

          {/* Política */}
          {p.politica && (
            <Surgir i={3}>
              <Card className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="eyebrow">Política aplicada</p>
                  <Link href="/dispositivos/politicas" className="text-[12px] text-muted hover:text-fg">ver políticas →</Link>
                </div>
                <p className="mt-2 text-[15px] font-semibold">{p.politica.nome}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                  <span className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2"><Usb className="size-3.5 text-subtle" />USB {p.politica.bloquearUsb ? <b className="ml-auto font-medium text-warn">bloqueado</b> : <b className="ml-auto font-medium text-ok">liberado</b>}</span>
                  <span className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2"><Download className="size-3.5 text-subtle" /><span className="truncate">{MODO_DOWNLOAD_LABEL[p.politica.modoDownload]}</span></span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.politica.sitesBloqueados.map((s) => <span key={s} className="rounded-full border border-line bg-white/[0.03] px-2 py-0.5 text-[11px] text-muted">⊘ {CATEGORIAS_SITE[s] ?? s}</span>)}
                </div>
              </Card>
            </Surgir>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden">
          <CardHeader title="Aplicativos instalados" description={`${d.appsInstalados.length} itens · gerenciados pela equipe do espaço`} />
          <ul className="max-h-[360px] overflow-y-auto">
            <AnimatePresence initial={false}>
              {d.appsInstalados.map((a) => (
                <motion.li key={a} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 border-t border-line px-5 py-2.5 first:border-t-0">
                  <span className="grid size-7 place-items-center rounded-md bg-white/[0.06] text-[11px] font-semibold">{a.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{a}</span>
                  {a === APP_AGENTE ? (
                    <span className="text-[10.5px] text-subtle">protegido</span>
                  ) : p.podeComandar && (
                    <button onClick={() => setPedido({ tipo: "REMOVER_APP", parametro: a })} aria-label={`Remover ${a}`} className="grid size-7 place-items-center rounded-md text-subtle opacity-60 transition hover:bg-danger-soft hover:text-danger hover:opacity-100">
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {p.podeComandar && catalogo.length > 0 && (
            <div className="border-t border-line p-3">
              <Button variant="secondary" size="sm" className="w-full" onClick={() => setPedido({ tipo: "INSTALAR_APP" })}><Plus />Instalar do catálogo</Button>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Ações enviadas" description="Na fila → entregue → concluída" />
          <ul className="max-h-[400px] overflow-y-auto">
            {acoes.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">Nenhuma ação enviada.</li>}
            <AnimatePresence initial={false}>
              {acoes.map((a) => (
                <motion.li key={a.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="border-t border-line px-5 py-3 first:border-t-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[13px] font-medium text-fg">
                      {a.tipo === "ALERTA" ? a.titulo : `${ACAO_DISPOSITIVO_LABEL[a.tipo]}${a.parametro ? ` · ${a.parametro}` : ""}`}
                    </span>
                    <StatusAcaoChip status={a.status} alerta={a.tipo === "ALERTA"} />
                  </div>
                  {(a.justificativa || a.motivo) && <p className="mt-1 text-[12px] text-muted">{a.motivo ?? `“${a.justificativa}”`}</p>}
                  <p className="mt-1 text-[11px] text-subtle">
                    {a.tipo === "ALERTA" && a.prioridade && <span className={cn("mr-1.5", PRIORIDADE[a.prioridade].classe.split(" ").pop())}>{PRIORIDADE[a.prioridade].rotulo} ·</span>}
                    {a.usuario.nome} · {tempoRelativo(a.criadoEm)}
                  </p>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </Card>

        {d.tipo !== "DESKTOP" && (
          <Card className="overflow-hidden">
            <CardHeader title="Empréstimos" description="Quem levou este aparelho" />
            <ul className="max-h-[260px] overflow-y-auto">
              {p.emprestimos.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">Nunca foi emprestado.</li>}
              {p.emprestimos.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-fg">{e.usuario.nome}{e.usuario.matricula && <span className="font-mono text-[11px] text-subtle"> · {e.usuario.matricula}</span>}</p>
                    <p className="mt-0.5 text-[11px] text-subtle">
                      {formatDataHora(e.retiradoEm)} → {e.devolvidoEm ? `${formatDataHora(e.devolvidoEm)} · recebido por ${e.recebidoPor?.nome.split(" ")[0] ?? "—"}` : `prazo ${formatDataHora(e.prazoEm)}`}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full border px-2 text-[10px] leading-5",
                    e.situacao === "ATRASADO" ? "border-danger/30 text-danger" : e.situacao === "ABERTO" ? "border-info/30 text-info" : "border-line text-subtle")}>
                    {e.situacao === "ATRASADO" ? "Atrasado" : e.situacao === "ABERTO" ? "Com o aluno" : "Devolvido"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="overflow-hidden">
          <CardHeader title="Eventos do agente" description="O que o dispositivo reportou" />
          <ul className="max-h-[400px] overflow-y-auto">
            {eventos.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">Sem eventos.</li>}
            {eventos.map((e) => (
              <li key={e.id} className="border-t border-line px-5 py-3 first:border-t-0">
                <p className={cn("text-[13px]", e.severidade === "CRITICO" ? "text-danger" : e.severidade === "AVISO" ? "text-warn" : "text-fg")}>{e.descricao}</p>
                <p className="mt-0.5 text-[11px] text-subtle">{formatDataHora(e.criadoEm)}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <DialogoAcao
        pedido={pedido}
        dispositivo={d}
        catalogo={catalogo.map((c) => c.nome)}
        enviando={enviando}
        onFechar={() => setPedido(null)}
        onEnviar={async (corpo) => { if (await enviar(corpo)) setPedido(null); }}
      />
    </div>
  );
}

/** Diálogo único para todas as ações: só mostra os campos que a ação pede. */
function DialogoAcao({ pedido, dispositivo: d, catalogo, enviando, onFechar, onEnviar }: {
  pedido: Pedido | null;
  dispositivo: DispositivoPainelDTO;
  catalogo: string[];
  enviando: boolean;
  onFechar: () => void;
  onEnviar: (corpo: Record<string, unknown>) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [prioridade, setPrioridade] = useState<SeveridadeAlarme>("AVISO");
  const [app, setApp] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [confirmacao, setConfirmacao] = useState("");

  useEffect(() => {
    if (!pedido) return;
    setTitulo(""); setMensagem(""); setPrioridade("AVISO"); setJustificativa(""); setConfirmacao("");
    setApp(pedido.parametro ?? catalogo[0] ?? "");
  }, [pedido, catalogo]);

  if (!pedido) return null;
  const t = pedido.tipo;
  const valido =
    t === "ALERTA" ? titulo.trim().length >= 3 && mensagem.trim().length >= 5 :
    t === "SESSAO_REMOTA" ? justificativa.trim().length >= 5 :
    t === "APAGAR_DADOS" ? justificativa.trim().length >= 10 && confirmacao.trim() === d.hostname :
    t === "INSTALAR_APP" ? !!app : true;

  const descricao: Partial<Record<TipoAcaoDispositivo, string>> = {
    ALERTA: "A mensagem aparece na tela do usuário. A confirmação de leitura volta para você.",
    BLOQUEAR: "A tela é travada na hora com a mensagem da equipe. Útil para notebook não devolvido, perdido ou uso indevido.",
    DESBLOQUEAR: "O usuário volta a usar o dispositivo normalmente.",
    REINICIAR: "O usuário é avisado com 2 minutos de antecedência para salvar o trabalho.",
    SINCRONIZAR: "O agente baixa e reaplica a política agora, sem esperar o próximo ciclo.",
    INSTALAR_APP: "Só aparecem aplicativos do catálogo aprovado e permitidos pela política deste dispositivo.",
    REMOVER_APP: "O aplicativo é desinstalado silenciosamente e o usuário recebe um aviso.",
    SESSAO_REMOTA: "O usuário recebe um pedido na tela e precisa autorizar. Ele vê um aviso durante toda a sessão e pode encerrar a qualquer momento (LGPD).",
    APAGAR_DADOS: "Remove os dados e aplicativos do espaço e bloqueia o notebook. Use em perda, roubo ou não devolução. Não pode ser desfeito.",
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !enviando && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className={cn(t === "APAGAR_DADOS" && "text-danger")}>
            {ACAO_DISPOSITIVO_LABEL[t]}{pedido.parametro ? ` · ${pedido.parametro}` : ""} → <span className="font-mono">{d.hostname}</span>
          </DialogTitle>
          <DialogDescription>{descricao[t]}</DialogDescription>
        </DialogHeader>

        {!d.leitura.online && t !== "SESSAO_REMOTA" && (
          <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-warn">Dispositivo offline: a ação fica na fila e é executada no próximo check-in.</p>
        )}

        {t === "ALERTA" && (
          <div className="space-y-3">
            <Field label="Título" htmlFor="da-t"><Input id="da-t" value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Salve seu trabalho" /></Field>
            <Field label="Mensagem" htmlFor="da-m"><Textarea id="da-m" rows={3} maxLength={400} value={mensagem} onChange={(e) => setMensagem(e.target.value)} /></Field>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PRIORIDADE) as SeveridadeAlarme[]).map((k) => (
                <button key={k} type="button" onClick={() => setPrioridade(k)} className={cn("rounded-lg border px-2 py-1.5 text-[12.5px]", prioridade === k ? PRIORIDADE[k].classe : "border-line text-muted")}>{PRIORIDADE[k].rotulo}</button>
              ))}
            </div>
          </div>
        )}
        {t === "INSTALAR_APP" && (
          <Field label="Aplicativo" htmlFor="da-app">
            <Select value={app} onValueChange={setApp}>
              <SelectTrigger id="da-app"><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>{catalogo.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        )}
        {(t === "SESSAO_REMOTA" || t === "APAGAR_DADOS" || t === "BLOQUEAR") && (
          <Field label={t === "SESSAO_REMOTA" ? "Chamado ou motivo" : "Justificativa"} htmlFor="da-j" hint={t === "BLOQUEAR" ? "Opcional · fica na auditoria" : "Obrigatória · fica na auditoria"}>
            <Input id="da-j" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder={t === "SESSAO_REMOTA" ? "Ex.: Chamado #4850 — impressora não imprime" : t === "APAGAR_DADOS" ? "Ex.: Notebook furtado — BO 2026/118" : "Ex.: Colaborador desligado"} />
          </Field>
        )}
        {t === "APAGAR_DADOS" && (
          <Field label={`Digite ${d.hostname} para confirmar`} htmlFor="da-c">
            <Input id="da-c" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} className="font-mono" autoComplete="off" />
          </Field>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar} disabled={enviando}>Cancelar</Button>
          <Button
            variant={t === "APAGAR_DADOS" || t === "REMOVER_APP" ? "danger" : "primary"}
            loading={enviando}
            disabled={!valido}
            onClick={() => onEnviar({
              tipo: t,
              parametro: t === "INSTALAR_APP" ? app : pedido.parametro,
              justificativa: justificativa.trim() || undefined,
              confirmacao: confirmacao.trim() || undefined,
              ...(t === "ALERTA" ? { titulo: titulo.trim(), mensagem: mensagem.trim(), prioridade } : {}),
            })}
          >
            {t === "APAGAR_DADOS" ? <Eraser /> : t === "REMOVER_APP" ? <PackageX /> : <ShieldCheck />}
            {t === "APAGAR_DADOS" ? "Apagar dados" : "Enviar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
