"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, Cctv, Network, Radio } from "lucide-react";
import { EquipmentIcon } from "@/components/equipment-icon";
import { NumeroAnimado, Surgir } from "@/components/motion";
import { Card, CardHeader, PageHeader, SearchInput, Segmented } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROTOCOLO_LABEL, SEVERIDADE_LABEL } from "@/lib/labels";
import type { AlarmeDTO, EquipamentoDTO, LaboratorioDTO, TelemetriaDTO } from "@/lib/types";
import { cn, tempoRelativo } from "@/lib/utils";
import { ESTADO_COR, EstadoBadge, SEV_COR, Sparkline, formatarDuracao, formatarMetrica } from "@/views/maquinas/maquina-ui";

type Filtro = "todas" | "operando" | "paradas" | "atencao";
const INTERVALO_MS = 2500;

export function MaquinasView({ equipamentos, laboratorios, leiturasIniciais, seriesIniciais, alarmesIniciais, topo }: {
  equipamentos: EquipamentoDTO[];
  laboratorios: LaboratorioDTO[];
  leiturasIniciais: TelemetriaDTO[];
  /** série recente da métrica principal de cada máquina */
  seriesIniciais: Record<string, (number | null)[]>;
  alarmesIniciais: AlarmeDTO[];
  topo?: React.ReactNode;
}) {
  const [leituras, setLeituras] = useState(() => new Map(leiturasIniciais.map((l) => [l.equipamentoId, l])));
  const [series, setSeries] = useState(seriesIniciais);
  const [alarmes, setAlarmes] = useState(alarmesIniciais);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [lab, setLab] = useState("todos");
  const [busca, setBusca] = useState("");
  const [conectado, setConectado] = useState(true);

  // Polling da telemetria (em produção poderia ser SSE/WebSocket a partir do gateway)
  useEffect(() => {
    let vivo = true;
    let n = 0;
    async function ciclo() {
      try {
        const r = await fetch("/api/maquinas/telemetria", { cache: "no-store" });
        if (!r.ok) throw new Error();
        const { leituras: novas } = (await r.json()) as { leituras: TelemetriaDTO[] };
        if (!vivo) return;
        setConectado(true);
        setLeituras(new Map(novas.map((l) => [l.equipamentoId, l])));
        setSeries((s) => {
          const out = { ...s };
          for (const l of novas) out[l.equipamentoId] = [...(out[l.equipamentoId] ?? []), l.metricas[0]?.valor ?? null].slice(-40);
          return out;
        });
        if (++n % 4 === 0) {
          const a = await fetch("/api/alarmes").then((x) => x.json());
          if (vivo) setAlarmes(a.alarmes);
        }
      } catch {
        if (vivo) setConectado(false);
      }
    }
    const id = setInterval(ciclo, INTERVALO_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);

  const lidas = equipamentos.map((e) => ({ e, l: leituras.get(e.id) })).filter((x): x is { e: EquipamentoDTO; l: TelemetriaDTO } => !!x.l);
  const conta = (f: (l: TelemetriaDTO) => boolean) => lidas.filter(({ l }) => f(l)).length;
  const online = conta((l) => l.online);
  const operando = conta((l) => l.estado === "OPERANDO");
  const oees = lidas.map(({ l }) => l.oee).filter((v): v is number => v !== null);
  const oeeMedio = oees.length ? oees.reduce((a, b) => a + b, 0) / oees.length : 0;
  const criticos = alarmes.filter((a) => a.severidade === "CRITICO").length;

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lidas.filter(({ e, l }) => {
      if (lab !== "todos" && e.laboratorio.id !== lab) return false;
      if (filtro === "operando" && l.estado !== "OPERANDO") return false;
      if (filtro === "paradas" && !(l.estado === "OCIOSO" || l.estado === "PAUSADO")) return false;
      if (filtro === "atencao" && !(l.estado === "ALARME" || l.estado === "OFFLINE" || l.estado === "MANUTENCAO" || l.alarmeAtivo)) return false;
      return !q || [e.nome, e.enderecoIp, e.fabricante, e.modelo, e.laboratorio.codigo].some((v) => v?.toLowerCase().includes(q));
    });
  }, [lidas, lab, filtro, busca]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação · tempo real"
        title="Central de máquinas"
        description="Impressoras 3D, cortadoras a laser e plotters: estado, telemetria, alarmes e câmera de cada máquina do espaço."
        actions={equipamentos.length === 0 ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 font-mono text-[11px] text-subtle">
            <Radio className="size-3.5" />aguardando máquinas cadastradas
          </span>
        ) : (
          <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px]", conectado ? "border-ok/25 text-ok" : "border-danger/30 text-danger")}>
            <Radio className={cn("size-3.5", conectado && "led-pulse")} />
            {conectado ? `gateway online · atualiza a cada ${INTERVALO_MS / 1000}s` : "sem conexão com o gateway"}
          </span>
        )}
      />
      {topo}

      {/* ── Frota ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador i={0} rotulo="Máquinas online" valor={online} sufixo={`/ ${lidas.length}`} detalhe={`${lidas.length - online} sem comunicação`} />
        <Indicador i={1} rotulo="Em produção agora" valor={operando} detalhe={`${conta((l) => l.estado === "PAUSADO")} pausadas · ${conta((l) => l.estado === "OCIOSO")} ociosas`} led />
        <Indicador i={2} rotulo="OEE médio" valor={Math.round(oeeMedio * 100)} unidade="%" detalhe="disponibilidade × desempenho × qualidade" />
        <Indicador i={3} rotulo="Alarmes ativos" valor={alarmes.length} detalhe={`${criticos} crítico${criticos === 1 ? "" : "s"}`} alerta={criticos > 0} />
      </div>

      {/* ── Alarmes ativos ── */}
      {alarmes.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="Alarmes ativos" description="Ordenados por gravidade. Clique para abrir a máquina e agir." />
          <ul>
            {alarmes.map((a) => (
              <li key={a.id} className="border-t border-line first:border-t-0">
                <Link href={`/equipamentos/${a.equipamento.id}`} className="grid items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-white/[0.02] sm:grid-cols-[110px_88px_minmax(0,1fr)_200px_24px]">
                  <span className={cn("inline-flex h-6 w-fit items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium", SEV_COR[a.severidade])}>
                    <AlertTriangle className="size-3" />
                    {SEVERIDADE_LABEL[a.severidade]}
                  </span>
                  <span className="font-mono text-[13px] text-fg">{a.codigo}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] text-fg">{a.mensagem}</span>
                    <span className="block truncate text-xs text-subtle">
                      {a.equipamento.nome} · <span className="font-mono">{a.equipamento.laboratorioCodigo}</span>
                    </span>
                  </span>
                  <span className="text-xs text-subtle sm:text-right">
                    ativo {tempoRelativo(a.ativoDesde)}
                    <br />
                    {a.reconhecidoPor ? `reconhecido por ${a.reconhecidoPor.split(" ")[0]}` : <span className="text-warn">aguardando reconhecimento</span>}
                  </span>
                  <ArrowUpRight className="hidden size-4 text-subtle sm:block" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Filtros ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: "todas", label: "Todas", count: lidas.length },
            { value: "operando", label: "Operando", count: operando },
            { value: "paradas", label: "Paradas" },
            { value: "atencao", label: "Requer atenção", count: conta((l) => l.estado === "ALARME" || l.estado === "OFFLINE" || l.estado === "MANUTENCAO" || !!l.alarmeAtivo) },
          ]}
        />
        <div className="flex gap-2">
          <Select value={lab} onValueChange={setLab}>
            <SelectTrigger className="h-8 w-52 text-[13px]" aria-label="Filtrar por laboratório"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os laboratórios</SelectItem>
              {laboratorios.map((l) => <SelectItem key={l.id} value={l.id}>{l.codigo} · {l.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <SearchInput value={busca} onChange={setBusca} placeholder="Nome, IP, fabricante…" />
        </div>
      </div>

      {/* ── Grade de máquinas ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visiveis.map(({ e, l }, i) => (
          <Surgir key={e.id} i={i}>
            <CardMaquina e={e} l={l} serie={series[e.id] ?? []} />
          </Surgir>
        ))}
      </div>
      {visiveis.length === 0 && <p className="py-16 text-center text-sm text-muted">{equipamentos.length === 0 ? "Nenhuma máquina cadastrada ainda. Cadastre em Máquinas → Inventário." : "Nenhuma máquina com esse filtro."}</p>}
    </div>
  );
}

function Indicador({ i, rotulo, valor, unidade, sufixo, detalhe, alerta, led }: { i: number; rotulo: string; valor: number; unidade?: string; sufixo?: string; detalhe: string; alerta?: boolean; led?: boolean }) {
  return (
    <Surgir i={i} className={cn("glass rounded-2xl border p-5", alerta ? "alarm-ring border-danger/40" : "border-line")}>
      <p className="eyebrow flex items-center gap-2">
        {led && <span className="ao-vivo size-1.5 rounded-full bg-ok text-ok" />}
        {rotulo}
      </p>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className={cn("text-[34px] font-semibold leading-none tracking-[-0.04em]", alerta && "text-danger")}><NumeroAnimado valor={valor} sufixo={unidade} /></span>
        {sufixo && <span className="text-sm text-subtle">{sufixo}</span>}
      </p>
      <p className="mt-3 truncate text-xs text-muted">{detalhe}</p>
    </Surgir>
  );
}

function CardMaquina({ e, l, serie }: { e: EquipamentoDTO; l: TelemetriaDTO; serie: (number | null)[] }) {
  const m = l.metricas[0];
  const cor = ESTADO_COR[l.estado];
  const emAlarme = l.estado === "ALARME" || l.alarmeAtivo?.severidade === "CRITICO";
  return (
    <Link
      href={`/equipamentos/${e.id}`}
      className={cn(
        "glass group relative flex h-full flex-col overflow-hidden rounded-2xl border transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-white/25",
        emAlarme ? "alarm-ring border-danger/40" : cor.borda,
      )}
    >
      {l.estado === "MANUTENCAO" && <div className="hazard h-1.5 opacity-80" />}
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <EquipmentIcon tipo={e.tipo} className="rounded-lg border-white/10 bg-white/[0.04]" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-fg">{e.nome}</p>
            <p className="truncate font-mono text-[11px] text-subtle">
              {e.laboratorio.codigo} · {e.enderecoIp ?? "sem IP"}
            </p>
          </div>
        </div>
        <EstadoBadge estado={l.estado} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-end gap-3 px-4">
        <div>
          <p className="truncate text-[11px] text-subtle">{m.rotulo}</p>
          <p className={cn("mt-0.5 font-mono text-[22px] font-medium leading-none tabular-nums", m.alerta ? "text-danger" : "text-fg")}>
            {formatarMetrica(m)}
            <span className="ml-1 text-xs font-normal text-subtle">{m.unidade}</span>
          </p>
        </div>
        <Sparkline valores={serie} min={m.min} max={m.max} alerta={m.alerta} />
      </div>

      <div className="mt-3 px-4">
        {l.programa ? (
          <>
            <div className="flex items-center justify-between gap-3 text-[11.5px]">
              <span className="truncate text-muted">{l.programa}</span>
              <span className="shrink-0 font-mono text-subtle">{formatarDuracao(l.restanteMin)}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
              <div className={cn("h-full rounded-full transition-[width] duration-700", l.estado === "OPERANDO" ? "bg-ok/80" : "bg-warn/80")} style={{ width: `${(l.progresso ?? 0) * 100}%` }} />
            </div>
          </>
        ) : (
          <p className="text-[11.5px] text-subtle">{l.online ? "Sem programa em execução" : `Último contato ${l.ultimoContatoEm ? tempoRelativo(l.ultimoContatoEm) : "desconhecido"}`}</p>
        )}
      </div>

      {l.alarmeAtivo ? (
        <div className={cn("mx-4 mt-3 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px]", SEV_COR[l.alarmeAtivo.severidade])}>
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="font-mono">{l.alarmeAtivo.codigo}</span>
          <span className="truncate">{l.alarmeAtivo.mensagem}</span>
        </div>
      ) : (
        <div className="mx-4 mt-3 h-[30px]" />
      )}

      <div className="mt-3 flex items-center justify-between border-t border-line px-4 py-2.5 font-mono text-[11px] text-subtle">
        <span className="flex items-center gap-1.5">
          <Network className="size-3" />
          {e.protocolo ? PROTOCOLO_LABEL[e.protocolo] : "—"}
          {l.latenciaMs !== null && <span className="text-muted"> · {l.latenciaMs} ms</span>}
        </span>
        <span className="flex items-center gap-3">
          {e.temCamera && <Cctv className="size-3.5 text-muted" aria-label="Câmera disponível" />}
          OEE {l.oee !== null ? `${Math.round(l.oee * 100)}%` : "—"}
        </span>
      </div>
    </Link>
  );
}
