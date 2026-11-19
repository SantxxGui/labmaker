"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, BellOff, CalendarClock, Cctv, Hand, OctagonX, Pause, Play, ShieldAlert, Terminal } from "lucide-react";
import { CameraFeed } from "@/components/industrial/camera-feed";
import { EquipmentIcon } from "@/components/equipment-icon";
import { CalibracaoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { COMANDO_LABEL, PROTOCOLO_LABEL, SEVERIDADE_LABEL, TIPO_LABEL } from "@/lib/labels";
import type { AgendamentoDTO, AlarmeDTO, ComandoDTO, EquipamentoDTO, TelemetriaDTO, TipoComando } from "@/lib/types";
import { cn, formatData, formatDataHora, formatHora, tempoRelativo } from "@/lib/utils";
import { AvisoZebrado, EstadoBadge, FaixaOperacional, SEV_COR, Sparkline, acumular, formatarDuracao, formatarMetrica } from "@/views/maquinas/maquina-ui";

type Props = {
  equipamento: EquipamentoDTO;
  leituraInicial: TelemetriaDTO;
  serieInicial: Record<string, (number | null)[]>;
  alarmesAtivos: AlarmeDTO[];
  historicoAlarmes: AlarmeDTO[];
  comandosIniciais: ComandoDTO[];
  reservas: AgendamentoDTO[];
  podeComandar: boolean;
};

const ACOES: { tipo: TipoComando; icone: React.ElementType; descricao: string }[] = [
  { tipo: "PAUSAR", icone: Pause, descricao: "Feed hold — interrompe o avanço mantendo o programa." },
  { tipo: "RETOMAR", icone: Play, descricao: "Continua o ciclo pausado." },
  { tipo: "RECONHECER_ALARMES", icone: BellOff, descricao: "Registra ciência dos alarmes ativos." },
  { tipo: "PARAR_CICLO", icone: OctagonX, descricao: "Encerra o programa. Exige justificativa." },
];

/** Pré-condições exibidas no botão (o servidor revalida tudo de novo). */
function disponivel(tipo: TipoComando, l: TelemetriaDTO, alarmes: AlarmeDTO[]) {
  if (!l.online) return false;
  switch (tipo) {
    case "PAUSAR": return l.estado === "OPERANDO";
    case "RETOMAR": return l.estado === "PAUSADO";
    case "RECONHECER_ALARMES": return alarmes.some((a) => !a.reconhecidoEm);
    case "PARAR_CICLO": return ["OPERANDO", "PAUSADO", "ALARME", "MANUTENCAO"].includes(l.estado);
  }
}

export function MaquinaDetalheView(p: Props) {
  const e = p.equipamento;
  const [leitura, setLeitura] = useState(p.leituraInicial);
  const [serie, setSerie] = useState(p.serieInicial);
  const [ativos, setAtivos] = useState(p.alarmesAtivos);
  const [historico, setHistorico] = useState(p.historicoAlarmes);
  const [comandos, setComandos] = useState(p.comandosIniciais);
  const [enviando, setEnviando] = useState<TipoComando | null>(null);
  const [confirmar, setConfirmar] = useState<TipoComando | null>(null);
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    let vivo = true;
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/equipamentos/${e.id}/telemetria`, { cache: "no-store" });
        if (!r.ok) return;
        const { leitura: l } = (await r.json()) as { leitura: TelemetriaDTO };
        if (!vivo) return;
        setLeitura(l);
        setSerie((s) => acumular(s, l.metricas));
      } catch {}
    }, 2000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [e.id]);

  async function recarregarListas() {
    const [a, c] = await Promise.all([
      fetch(`/api/equipamentos/${e.id}/alarmes`).then((r) => r.json()),
      fetch(`/api/equipamentos/${e.id}/comandos`).then((r) => r.json()),
    ]);
    setAtivos(a.ativos);
    setHistorico(a.historico);
    setComandos(c.comandos);
  }

  async function enviar(tipo: TipoComando, just?: string) {
    setEnviando(tipo);
    try {
      const r = await fetch(`/api/equipamentos/${e.id}/comandos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, justificativa: just || undefined }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error("Comando recusado pela máquina", { description: d.error });
      } else {
        setLeitura(d.leitura);
        toast.success(`${COMANDO_LABEL[tipo]} executado`, { description: `${e.nome} · confirmado pelo gateway` });
        setConfirmar(null);
        setJustificativa("");
      }
      await recarregarListas();
    } catch {
      toast.error("Falha de comunicação com o gateway.");
    } finally {
      setEnviando(null);
    }
  }

  const criticoAtivo = ativos.some((a) => a.severidade === "CRITICO");

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <Link href="/equipamentos" className="inline-flex items-center gap-1.5 text-[13px] text-subtle transition-colors hover:text-fg">
          <ArrowLeft className="size-3.5" /> Central de máquinas
        </Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-4">
            <EquipmentIcon tipo={e.tipo} className="size-12 rounded-xl border-white/10 bg-white/[0.04] [&_svg]:size-5" />
            <div className="min-w-0">
              <p className="eyebrow">{TIPO_LABEL[e.tipo]} · {e.laboratorio.codigo} · {e.laboratorio.unidadeSigla}</p>
              <h1 className="mt-1.5 text-[28px] font-semibold leading-tight tracking-[-0.035em]">{e.nome}</h1>
              <p className="mt-1 text-sm text-muted">{[e.fabricante, e.modelo, e.numeroSerie && `S/N ${e.numeroSerie}`].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <EstadoBadge estado={leitura.estado} className="h-8 px-3 text-[13px]" />
            {leitura.oee !== null && (
              <span className="glass inline-flex h-8 items-center rounded-full border border-line px-3 font-mono text-xs text-muted">
                OEE <span className="ml-1.5 text-fg">{Math.round(leitura.oee * 100)}%</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {criticoAtivo && (
        <div className="alarm-ring flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" />
          <p className="text-fg">
            {leitura.online ? (
              <><span className="font-medium text-danger">Alarme crítico ativo.</span>{" "}A retomada remota fica bloqueada até a causa ser tratada no local e a manutenção liberar o equipamento (NR-12).</>
            ) : (
              <><span className="font-medium text-danger">Máquina sem comunicação.</span>{" "}Nenhum comando pode ser enviado. Verifique alimentação, cabo de rede e o switch da célula no local.</>
            )}
          </p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,1fr)]">
        {/* Coluna esquerda: câmera + métricas */}
        <div className="min-w-0 space-y-4">
          <Card className="overflow-hidden p-0">
            {e.temCamera ? (
              <CameraFeed tipo={e.tipo} estado={leitura.estado} rotulo={`CAM · ${e.laboratorio.codigo} · ${e.nome.toUpperCase()}`} />
            ) : (
              <div className="grid aspect-video place-items-center bg-black/40 text-center">
                <div>
                  <Cctv className="mx-auto size-6 text-subtle" />
                  <p className="mt-3 text-sm text-muted">Nenhuma câmera associada a este equipamento.</p>
                  <p className="mt-1 text-xs text-subtle">Cadastre a URL RTSP da câmera IP para exibir o vídeo aqui.</p>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 font-mono text-[11px] text-subtle">
              <span>{e.temCamera ? "Câmera IP · RTSP → WebRTC via gateway" : "sem câmera"}</span>
              <span>leitura {formatHora(leitura.lidoEm)}:{new Date(leitura.lidoEm).getSeconds().toString().padStart(2, "0")}</span>
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            {leitura.metricas.map((m) => (
              <div key={m.chave} className={cn("glass rounded-2xl border p-4", m.alerta ? "alarm-ring border-danger/40" : "border-line")}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[12.5px] text-muted">{m.rotulo}</p>
                  {m.alerta && <span className="rounded-full border border-danger/30 bg-danger-soft px-2 text-[10.5px] font-medium leading-5 text-danger">fora da faixa</span>}
                </div>
                <p className={cn("mt-2 font-mono text-[26px] font-medium leading-none tabular-nums", m.alerta ? "text-danger" : "text-fg")}>
                  {formatarMetrica(m)}
                  <span className="ml-1.5 text-[13px] font-normal text-subtle">{m.unidade}</span>
                </p>
                <Sparkline valores={serie[m.chave] ?? []} min={m.min} max={m.max} alerta={m.alerta} className="mt-3 h-12" />
                <FaixaOperacional m={m} />
                <p className="mt-1.5 flex justify-between font-mono text-[10.5px] text-subtle">
                  <span>{m.min}</span><span>faixa operacional</span><span>{m.max}</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Coluna direita: programa, comandos, conectividade */}
        <div className="min-w-0 space-y-4">
          <Card className="p-5">
            <p className="eyebrow">Programa em execução</p>
            {leitura.programa ? (
              <>
                <p className="mt-3 font-mono text-[15px] text-fg">{leitura.programa}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                  <div className={cn("h-full rounded-full transition-[width] duration-700", leitura.estado === "OPERANDO" ? "bg-ok" : "bg-warn")} style={{ width: `${(leitura.progresso ?? 0) * 100}%` }} />
                </div>
                <p className="mt-2 flex justify-between text-xs text-muted">
                  <span>{Math.round((leitura.progresso ?? 0) * 100)}% concluído</span>
                  <span>{formatarDuracao(leitura.restanteMin)} restantes</span>
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">{leitura.online ? "Nenhum programa em execução." : "Sem comunicação com o controlador."}</p>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow flex items-center gap-2"><Terminal className="size-3.5" /> Comando remoto</p>
              {!p.podeComandar && <span className="text-[11px] text-subtle">somente leitura</span>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {ACOES.map(({ tipo, icone: Icone, descricao }) => {
                const ok = p.podeComandar && disponivel(tipo, leitura, ativos);
                return (
                  <button
                    key={tipo}
                    disabled={!ok || !!enviando}
                    title={descricao}
                    onClick={() => (tipo === "RECONHECER_ALARMES" ? enviar(tipo) : setConfirmar(tipo))}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-35",
                      tipo === "PARAR_CICLO" ? "border-danger/30 bg-danger-soft/40 hover:bg-danger-soft" : "border-line bg-white/[0.02] hover:bg-white/[0.06]",
                    )}
                  >
                    <Icone className={cn("size-4", tipo === "PARAR_CICLO" ? "text-danger" : "text-fg")} />
                    <span className="text-[13px] font-medium text-fg">{enviando === tipo ? "Enviando…" : COMANDO_LABEL[tipo]}</span>
                  </button>
                );
              })}
            </div>
            <AvisoZebrado className="mt-4">
              <div className="flex items-start gap-2.5 px-3 py-2.5 text-[12px] leading-relaxed text-muted">
                <Hand className="mt-0.5 size-3.5 shrink-0 text-signal" />
                <span>
                  <span className="text-fg">Parada de emergência é sempre física, no local.</span> Comandos remotos passam pelo gateway, são validados contra o estado da máquina e ficam registrados na auditoria.
                </span>
              </div>
            </AvisoZebrado>
          </Card>

          <Card className="p-5">
            <p className="eyebrow">Conectividade</p>
            <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2.5 text-[13px]">
              {[
                ["Endereço IP", e.enderecoIp ?? "—"],
                ["Protocolo", e.protocolo ? PROTOCOLO_LABEL[e.protocolo] : "—"],
                ["Firmware", e.firmware ?? "—"],
                ["Latência", leitura.latenciaMs !== null ? `${leitura.latenciaMs} ms` : "—"],
                ["Último contato", leitura.ultimoContatoEm ? tempoRelativo(leitura.ultimoContatoEm) : "—"],
                ["Gateway", "Raspberry Pi do espaço · rede das máquinas"],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-subtle">{k}</dt>
                  <dd className={cn("truncate text-right font-mono text-[12.5px]", k === "Último contato" && !leitura.online ? "text-danger" : "text-fg")}>{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Calibração</p>
              <CalibracaoBadge situacao={e.calibracao} />
            </div>
            <p className="mt-3 text-sm text-muted">
              {e.requerCalibracao
                ? e.proximaCalibracaoEm ? <>Próxima em <span className="text-fg">{formatData(e.proximaCalibracaoEm)}</span> · ciclo de {e.intervaloCalibracaoDias} dias</> : "Sem calibração registrada."
                : "Equipamento sem exigência metrológica."}
            </p>
          </Card>
        </div>
      </div>

      {/* Alarmes, comandos e reservas */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden">
          <CardHeader title="Alarmes" description={`${ativos.length} ativo(s) · histórico dos últimos eventos`} />
          <ul className="max-h-[380px] overflow-y-auto">
            {historico.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">Nenhum alarme registrado.</li>}
            {historico.map((a) => (
              <li key={a.id} className="border-t border-line px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10.5px] font-medium", SEV_COR[a.severidade])}>
                    {!a.encerradoEm && <AlertTriangle className="size-2.5" />}
                    {SEVERIDADE_LABEL[a.severidade]}
                  </span>
                  <span className="font-mono text-xs text-fg">{a.codigo}</span>
                  <span className={cn("ml-auto text-[11px]", a.encerradoEm ? "text-subtle" : "text-danger")}>{a.encerradoEm ? "encerrado" : "ativo"}</span>
                </div>
                <p className="mt-1.5 text-[13px] text-fg">{a.mensagem}</p>
                <p className="mt-1 text-[11.5px] text-subtle">
                  {formatDataHora(a.ativoDesde)}
                  {a.reconhecidoPor && ` · reconhecido por ${a.reconhecidoPor.split(" ")[0]}`}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Comandos enviados" description="Inclusive os recusados pela máquina" />
          <ul className="max-h-[380px] overflow-y-auto">
            {comandos.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">Nenhum comando enviado.</li>}
            {comandos.map((c) => (
              <li key={c.id} className="border-t border-line px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-fg">{COMANDO_LABEL[c.tipo]}</span>
                  <span className={cn("rounded-full border px-2 text-[10.5px] font-medium leading-5", c.status === "EXECUTADO" ? "border-ok/30 bg-ok-soft text-ok" : "border-danger/30 bg-danger-soft text-danger")}>
                    {c.status === "EXECUTADO" ? "executado" : "recusado"}
                  </span>
                </div>
                {(c.motivo || c.justificativa) && <p className="mt-1 text-[12px] text-muted">{c.motivo ?? `“${c.justificativa}”`}</p>}
                <p className="mt-1 text-[11.5px] text-subtle">{c.usuario.nome} · {tempoRelativo(c.criadoEm)}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Próximas reservas" description="Quem vai usar a máquina" />
          <ul className="max-h-[380px] overflow-y-auto">
            {p.reservas.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">Sem reservas futuras.</li>}
            {p.reservas.map((r) => (
              <li key={r.id} className="flex items-center gap-3 border-t border-line px-5 py-3">
                <CalendarClock className="size-4 shrink-0 text-subtle" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-fg">{r.usuario?.nome ?? "Reserva"}</p>
                  <p className="truncate text-[11.5px] text-subtle">{formatData(r.inicio)} · {formatHora(r.inicio)}–{formatHora(r.fim)}{r.finalidade && ` · ${r.finalidade}`}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Confirmação de comando */}
      <Dialog open={!!confirmar} onOpenChange={(o) => !enviando && !o && setConfirmar(null)}>
        <DialogContent className="max-w-md">
          {confirmar && (
            <>
              <DialogHeader>
                <DialogTitle>{COMANDO_LABEL[confirmar]} · {e.nome}</DialogTitle>
                <DialogDescription>
                  {ACOES.find((a) => a.tipo === confirmar)?.descricao} O comando será enviado ao controlador em {e.enderecoIp} e registrado em seu nome.
                </DialogDescription>
              </DialogHeader>
              {confirmar === "PARAR_CICLO" && (
                <Field label="Justificativa" htmlFor="just" hint="Obrigatória. Fica na trilha de auditoria.">
                  <Textarea id="just" rows={3} value={justificativa} onChange={(ev) => setJustificativa(ev.target.value)} placeholder="Ex.: desvio dimensional na peça, interromper para inspeção" />
                </Field>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirmar(null)} disabled={!!enviando}>Cancelar</Button>
                <Button
                  variant={confirmar === "PARAR_CICLO" ? "danger" : "primary"}
                  loading={!!enviando}
                  disabled={confirmar === "PARAR_CICLO" && justificativa.trim().length < 5}
                  onClick={() => enviar(confirmar, justificativa.trim())}
                >
                  Enviar comando
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
