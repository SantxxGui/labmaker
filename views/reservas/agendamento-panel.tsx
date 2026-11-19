"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Check, Clock, RefreshCw } from "lucide-react";
import { EquipmentIcon } from "@/components/equipment-icon";
import { Badge, CalibracaoBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, SearchInput } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIPO_LABEL } from "@/lib/labels";
import { LAB, bloqueadoPorCalibracao, diaDaSemana, diaNoLab, hojeNoLab } from "@/lib/slots";
import type { AgendamentoDTO, DisponibilidadeDTO, EquipamentoDTO, LaboratorioDTO, SlotDTO } from "@/lib/types";
import { TIMEZONE, capitalizar, cn, fetchJson, formatHora } from "@/lib/utils";
import { MiniCalendar } from "@/views/reservas/mini-calendar";
import { MinhasReservas } from "@/views/reservas/minhas-reservas";

const CACHE_TTL = 20_000; // ms — depois disso a grade é revalidada em segundo plano
const fmtLonga = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: TIMEZONE });

function somarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const fechado = (iso: string) => (LAB.diasFechados as number[]).includes(diaDaSemana(iso));
const indisponivel = (e: EquipamentoDTO) => e.status === "MANUTENCAO" || bloqueadoPorCalibracao(e.calibracao);

const PERIODOS = [
  { id: "manha", label: "Manhã", de: 0, ate: 12 },
  { id: "tarde", label: "Tarde", de: 12, ate: 18 },
  { id: "noite", label: "Noite", de: 18, ate: 24 },
] as const;

export function AgendamentoPanel({ equipamentos, laboratorios, initialReservas, podeReservar }: {
  equipamentos: EquipamentoDTO[];
  laboratorios: LaboratorioDTO[];
  initialReservas: AgendamentoDTO[];
  podeReservar: boolean;
}) {
  const hoje = useMemo(() => hojeNoLab(), []);
  const limite = useMemo(() => somarDias(hoje, LAB.janelaDias), [hoje]);

  const [lab, setLab] = useState("todos");
  const [busca, setBusca] = useState("");
  const [equipId, setEquipId] = useState<string | undefined>(() => (equipamentos.find((e) => !indisponivel(e)) ?? equipamentos[0])?.id);
  const [data, setData] = useState(() => {
    // Depois do expediente não há mais horários hoje: começa no próximo dia útil
    const horaSP = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: TIMEZONE }).format(new Date()));
    let d = horaSP >= LAB.fechamento - 1 ? somarDias(hoje, 1) : hoje;
    while (fechado(d)) d = somarDias(d, 1);
    return d;
  });
  const [disp, setDisp] = useState<DisponibilidadeDTO | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [revalidando, setRevalidando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [slotSel, setSlotSel] = useState<SlotDTO | null>(null);
  const [finalidade, setFinalidade] = useState("");
  const [reservando, setReservando] = useState(false);
  const [reservas, setReservas] = useState(initialReservas);

  // Cache stale-while-revalidate por equipamento+dia
  const cache = useRef(new Map<string, { at: number; data: DisponibilidadeDTO }>());
  const inflight = useRef(new Map<string, Promise<DisponibilidadeDTO>>());
  const reqId = useRef(0);

  const equipamento = equipamentos.find((e) => e.id === equipId);
  const diasComReserva = useMemo(() => new Set(reservas.map((r) => diaNoLab(r.inicio))), [reservas]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return equipamentos.filter(
      (e) =>
        (lab === "todos" || e.laboratorio.id === lab) &&
        (!q || [e.nome, e.fabricante, e.modelo, e.patrimonio, TIPO_LABEL[e.tipo]].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [equipamentos, lab, busca]);

  const buscar = useCallback((id: string, dia: string) => {
    const key = `${id}|${dia}`;
    const emCurso = inflight.current.get(key);
    if (emCurso) return emCurso;
    const p = fetchJson<DisponibilidadeDTO>(`/api/equipamentos/${id}/disponibilidade?data=${dia}`, { cache: "no-store" })
      .then((res) => {
        cache.current.set(key, { at: Date.now(), data: res });
        return res;
      })
      .finally(() => inflight.current.delete(key));
    inflight.current.set(key, p);
    return p;
  }, []);

  /** Pré-carrega ao passar o mouse num dia/equipamento — o clique abre na hora. */
  const prefetch = useCallback(
    (id: string | undefined, dia: string) => {
      if (!id) return;
      const hit = cache.current.get(`${id}|${dia}`);
      if (!hit || Date.now() - hit.at > CACHE_TTL) buscar(id, dia).catch(() => {});
    },
    [buscar],
  );

  /** Consulta dinâmica de disponibilidade (fetch, sem recarregar a página). */
  const carregar = useCallback(
    async (opts?: { forcar?: boolean }) => {
      if (!equipId) return;
      const key = `${equipId}|${data}`;
      const meu = ++reqId.current;
      const hit = cache.current.get(key);

      setErro(null);
      setSlotSel(null);
      if (hit && !opts?.forcar) {
        setDisp(hit.data);
        setCarregando(false);
        if (Date.now() - hit.at < CACHE_TTL) return;
        setRevalidando(true);
      } else {
        if (opts?.forcar) cache.current.delete(key);
        if (hit) setRevalidando(true);
        else setCarregando(true);
      }

      try {
        const res = await buscar(equipId, data);
        if (meu === reqId.current) setDisp(res);
      } catch (err) {
        if (meu === reqId.current) {
          setErro(err instanceof Error ? err.message : "Falha ao consultar horários.");
          setDisp(null);
        }
      } finally {
        if (meu === reqId.current) {
          setCarregando(false);
          setRevalidando(false);
        }
      }
    },
    [equipId, data, buscar],
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function reservar() {
    if (!slotSel || !equipId) return;
    setReservando(true);
    try {
      const { agendamento } = await fetchJson<{ agendamento: AgendamentoDTO }>("/api/agendamentos", {
        method: "POST",
        body: JSON.stringify({ equipamentoId: equipId, inicio: slotSel.inicio, finalidade: finalidade.trim() || undefined }),
      });
      setReservas((r) => [...r, agendamento].sort((a, b) => a.inicio.localeCompare(b.inicio)));
      setFinalidade("");
      toast.success("Reserva confirmada", {
        description: `${agendamento.equipamento.nome} · ${formatHora(agendamento.inicio)}–${formatHora(agendamento.fim)}`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível reservar.");
    } finally {
      setReservando(false);
      await carregar({ forcar: true }); // a grade muda nos dois casos
    }
  }

  function onCancelada(id: string) {
    const r = reservas.find((x) => x.id === id);
    setReservas((l) => l.filter((x) => x.id !== id));
    if (r) {
      cache.current.delete(`${r.equipamento.id}|${diaNoLab(r.inicio)}`);
      if (r.equipamento.id === equipId && diaNoLab(r.inicio) === data) carregar({ forcar: true });
    }
  }

  const livres = disp?.slots.filter((s) => s.disponivel).length ?? 0;
  const dataLonga = capitalizar(fmtLonga.format(new Date(`${data}T12:00:00-03:00`)));
  const porPeriodo = useMemo(
    () =>
      disp
        ? PERIODOS.map((p) => ({
            ...p,
            slots: disp.slots.filter((s) => {
              const h = Number(s.label.slice(0, 2));
              return h >= p.de && h < p.ate;
            }),
          })).filter((p) => p.slots.length > 0)
        : [],
    [disp],
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operação" title="Reservar equipamento" description="Escolha o equipamento, o dia e um horário livre. A disponibilidade é consultada em tempo real." />

      <div className="grid gap-6 xl:grid-cols-12">
        {/* ───────── 1. Equipamento ───────── */}
        <Card className="min-w-0 xl:col-span-4">
          <div className="space-y-3 border-b border-line p-4">
            <Passo n={1} titulo="Equipamento" />
            <Select value={lab} onValueChange={setLab}>
              <SelectTrigger aria-label="Filtrar por laboratório">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os laboratórios</SelectItem>
                {laboratorios.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.codigo} · {l.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por nome, modelo, patrimônio…" className="h-10 sm:w-full" />
          </div>
          <ul className="max-h-[520px] overflow-y-auto p-2" role="listbox" aria-label="Equipamentos">
            {lista.length === 0 && <li className="px-3 py-10 text-center text-sm text-muted">{equipamentos.length === 0 ? "O Líder do espaço ainda não cadastrou máquinas para reserva." : "Nenhum equipamento encontrado."}</li>}
            {lista.map((e) => {
              const ativo = e.id === equipId;
              return (
                <li key={e.id}>
                  <button
                    role="option"
                    aria-selected={ativo}
                    onClick={() => setEquipId(e.id)}
                    onMouseEnter={() => prefetch(e.id, data)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                      ativo ? "border-accent bg-accent-soft" : "border-transparent hover:bg-raised",
                      indisponivel(e) && !ativo && "opacity-60",
                    )}
                  >
                    <EquipmentIcon tipo={e.tipo} className={cn(ativo && "border-accent/40 bg-surface text-accent-text")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-fg">{e.nome}</span>
                      <span className="block truncate text-[11.5px] text-subtle">
                        <span className="font-mono">{e.laboratorio.codigo}</span> · {[e.fabricante, e.modelo].filter(Boolean).join(" ")}
                      </span>
                    </span>
                    {bloqueadoPorCalibracao(e.calibracao) ? <CalibracaoBadge situacao={e.calibracao} /> : <StatusBadge status={e.status} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* ───────── 2. Dia e horário ───────── */}
        <Card className="min-w-0 xl:col-span-5">
          <div className="border-b border-line p-4">
            <Passo n={2} titulo="Dia e horário" />
            <div className="mx-auto mt-4 max-w-[300px]">
              <MiniCalendar value={data} onChange={setData} onHoverDay={(d) => prefetch(equipId, d)} min={hoje} max={limite} isDisabled={fechado} marcados={diasComReserva} />
            </div>
          </div>

          <div className="min-h-[260px] p-4">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-fg">{dataLonga}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  {disp && !disp.bloqueado && !carregando ? (
                    <>
                      <span className="font-medium text-fg">{livres}</span> horários livres · <Clock className="size-3" /> {disp.equipamento.duracaoSlotMinutos} min cada
                    </>
                  ) : (
                    equipamento?.nome
                  )}
                </p>
              </div>
              <button onClick={() => carregar({ forcar: true })} aria-label="Atualizar horários" title="Atualizar" className="grid size-8 shrink-0 place-items-center rounded-md text-muted transition hover:bg-raised hover:text-fg">
                <RefreshCw className={cn("size-4", (carregando || revalidando) && "animate-spin")} />
              </button>
            </div>

            <AnimatePresence mode="wait">
              {carregando ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap gap-2">
                  {Array.from({ length: 10 }).map((_, j) => (
                    <div key={j} className="skeleton h-9 w-[76px] rounded-md" />
                  ))}
                </motion.div>
              ) : erro ? (
                <Aviso key="erro" tom="danger" titulo="Não foi possível carregar" texto={erro} />
              ) : disp?.bloqueado ? (
                <Aviso
                  key={`b-${equipId}-${data}`}
                  tom={equipamento && indisponivel(equipamento) ? "danger" : "neutral"}
                  titulo={equipamento?.status === "MANUTENCAO" ? "Equipamento em manutenção" : equipamento && bloqueadoPorCalibracao(equipamento.calibracao) ? "Calibração vencida" : "Sem horários nesta data"}
                  texto={disp.motivo ?? ""}
                />
              ) : disp && livres === 0 ? (
                <Aviso key={`l-${equipId}-${data}`} tom="neutral" titulo="Dia lotado" texto="Todos os horários já foram reservados ou encerrados. Tente outro dia ou outro equipamento." />
              ) : disp ? (
                <motion.div key={`${equipId}-${data}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-4">
                  {porPeriodo.map((p) => (
                    <div key={p.id}>
                      <p className="eyebrow mb-2">{p.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {p.slots.map((s) => (
                          <SlotPill key={s.inicio} slot={s} selecionado={slotSel?.inicio === s.inicio} desabilitado={!podeReservar} onSelect={() => setSlotSel((c) => (c?.inicio === s.inicio ? null : s))} />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[11px] text-subtle">
                    <Legenda className="border border-line-strong bg-surface">Livre</Legenda>
                    <Legenda className="bg-accent">Selecionado</Legenda>
                    <Legenda className="bg-info-soft ring-1 ring-inset ring-info/40">Sua reserva</Legenda>
                    <Legenda className="hatch border border-line">Ocupado / encerrado</Legenda>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </Card>

        {/* ───────── 3. Confirmação ───────── */}
        <aside className="min-w-0 xl:col-span-3">
          <div className="space-y-6 xl:sticky xl:top-9">
            <Card className="p-4">
              <Passo n={3} titulo="Confirmar" />
              <dl className="mt-4 space-y-2.5 text-[13px]">
                <Linha label="Equipamento" value={equipamento?.nome ?? "—"} />
                <Linha label="Laboratório" value={equipamento ? <span className="font-mono text-xs">{equipamento.laboratorio.codigo}</span> : "—"} />
                <Linha label="Data" value={dataLonga} />
                <Linha label="Horário" value={slotSel ? <span className="font-mono">{formatHora(slotSel.inicio)} – {formatHora(slotSel.fim)}</span> : <span className="text-subtle">Escolha um horário</span>} />
              </dl>
              {podeReservar ? (
                <>
                  <Input value={finalidade} onChange={(e) => setFinalidade(e.target.value)} maxLength={120} placeholder="Finalidade / projeto (opcional)" className="mt-4" aria-label="Finalidade" />
                  <Button size="lg" className="group mt-3 w-full" disabled={!slotSel} loading={reservando} onClick={reservar}>
                    Confirmar reserva
                    {!reservando && <ArrowRight className="transition-transform group-hover:translate-x-0.5" />}
                  </Button>
                </>
              ) : (
                <p className="mt-4 rounded-md border border-line bg-raised p-3 text-xs text-muted">Seu perfil é somente leitura: você pode consultar a disponibilidade, mas não criar reservas.</p>
              )}
            </Card>
            <MinhasReservas reservas={reservas} onCancelada={onCancelada} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Passo({ n, titulo }: { n: number; titulo: string }) {
  return (
    <h2 className="flex items-center gap-2.5 text-sm font-semibold text-fg">
      <span className="grid size-5 place-items-center rounded-[5px] bg-fg font-mono text-[11px] text-bg">{n}</span>
      {titulo}
    </h2>
  );
}

function SlotPill({ slot, selecionado, desabilitado, onSelect }: { slot: SlotDTO; selecionado: boolean; desabilitado: boolean; onSelect: () => void }) {
  const meu = slot.motivo === "meu";
  const ocupado = !slot.disponivel && !meu;
  return (
    <button
      type="button"
      disabled={!slot.disponivel || desabilitado}
      onClick={onSelect}
      aria-pressed={selecionado}
      title={meu ? "Sua reserva" : slot.motivo === "ocupado" ? "Ocupado" : slot.motivo === "passado" ? "Horário encerrado" : undefined}
      className={cn(
        "inline-flex h-9 min-w-[76px] items-center justify-center gap-1.5 rounded-md border px-3 font-mono text-[13px] tabular-nums transition-colors duration-100",
        slot.disponivel && !selecionado && "border-line-strong bg-surface text-fg hover:border-accent hover:bg-accent-soft",
        slot.disponivel && desabilitado && "cursor-default hover:border-line-strong hover:bg-surface",
        selecionado && "border-accent bg-accent font-semibold text-accent-fg",
        meu && "cursor-default border-info/40 bg-info-soft text-info",
        ocupado && "hatch cursor-not-allowed border-line text-subtle",
      )}
    >
      {selecionado && <Check className="size-3.5" strokeWidth={3} />}
      {slot.label}
    </button>
  );
}

function Aviso({ titulo, texto, tom }: { titulo: string; texto: string; tom: "danger" | "neutral" }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3 py-10 text-center">
      <span className={cn("grid size-10 place-items-center rounded-md", tom === "danger" ? "bg-danger-soft text-danger" : "border border-line bg-raised text-muted")}>
        <AlertTriangle className="size-4" />
      </span>
      <div>
        <p className="text-sm font-medium text-fg">{titulo}</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{texto}</p>
      </div>
    </motion.div>
  );
}

function Legenda({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-[3px]", className)} />
      {children}
    </span>
  );
}

function Linha({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-fg">{value}</dd>
    </div>
  );
}
