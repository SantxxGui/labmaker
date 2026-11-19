import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import { EquipmentIcon } from "@/components/equipment-icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge, CalibracaoBadge } from "@/components/ui/badge";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { ACAO_LABEL } from "@/lib/labels";
import { LAB, diaDaSemana, hojeNoLab } from "@/lib/slots";
import type { PainelDTO } from "@/lib/types";
import { capitalizar, cn, diasAte, formatData, formatDataCurta, formatHora, tempoRelativo } from "@/lib/utils";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

export function PainelView({ dados: d, nome, chaoDeFabrica }: { dados: PainelDTO; nome: string; chaoDeFabrica?: React.ReactNode }) {
  const hoje = hojeNoLab();
  const delta = Math.round((d.utilizacao7d - d.utilizacao7dAnterior) * 100);
  const maxHoras = Math.max(1, ...d.reservasPorDia.map((x) => x.horas));
  const dataHoje = capitalizar(
    new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date()),
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={dataHoje} title={`Bom trabalho, ${nome.split(" ")[0]}`} description="Visão consolidada dos laboratórios: operação das máquinas, ocupação, disponibilidade e conformidade." />

      {chaoDeFabrica}

      {/* ── Indicadores ── */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Utilização · 7 dias" valor={pct(d.utilizacao7d)}>
          <span className={cn("inline-flex items-center gap-1 font-medium", delta > 0 ? "text-ok" : delta < 0 ? "text-danger" : "text-muted")}>
            {delta > 0 ? <ArrowUpRight className="size-3.5" /> : delta < 0 ? <ArrowDownRight className="size-3.5" /> : <Minus className="size-3.5" />}
            {Math.abs(delta)} p.p.
          </span>{" "}
          vs. semana anterior
        </Kpi>
        <Kpi label="Equipamentos disponíveis" valor={d.equipamentos.livres} sufixo={`/ ${d.equipamentos.total}`}>
          {d.equipamentos.emUso} em uso · {d.equipamentos.manutencao} em manutenção
        </Kpi>
        <Kpi label="Reservas hoje" valor={d.reservasHoje}>
          {d.reservasProximos7d} nos próximos 7 dias
        </Kpi>
        <Kpi label="Calibração" valor={d.calibracao.vencidas} sufixo={d.calibracao.vencidas === 1 ? "vencida" : "vencidas"} alerta={d.calibracao.vencidas > 0}>
          {d.calibracao.aVencer30d} a vencer em {LAB.alertaCalibracaoDias} dias
        </Kpi>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* ── Ocupação diária ── */}
        <Card className="flex flex-col xl:col-span-2">
          <CardHeader title="Horas reservadas por dia" description="Últimos 14 dias, todos os laboratórios." />
          <div className="flex flex-1 flex-col px-5 pb-5 pt-6">
            <div className="flex min-h-44 flex-1 items-end gap-1.5 sm:gap-2.5">
              {d.reservasPorDia.map((x) => {
                const fechado = (LAB.diasFechados as number[]).includes(diaDaSemana(x.dia));
                const ehHoje = x.dia === hoje;
                return (
                  <div key={x.dia} className="group relative flex h-full flex-1 flex-col justify-end" title={`${formatDataCurta(`${x.dia}T12:00:00-03:00`)} — ${x.horas} h em ${x.reservas} reservas`}>
                    <span className="mb-1 text-center font-mono text-[10px] text-subtle opacity-0 transition-opacity group-hover:opacity-100">{Math.round(x.horas)}h</span>
                    {fechado ? (
                      <div className="hatch h-full rounded-[3px] border border-line" />
                    ) : (
                      <div
                        className={cn("rounded-[3px] transition-colors", ehHoje ? "bg-accent" : "bg-line-strong group-hover:bg-muted")}
                        style={{ height: `${Math.max(2, (x.horas / maxHoras) * 100)}%` }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-1.5 sm:gap-2.5">
              {d.reservasPorDia.map((x) => (
                <div key={x.dia} className={cn("flex-1 text-center font-mono text-[10px] leading-tight", x.dia === hoje ? "font-semibold text-accent-text" : "text-subtle")}>
                  {SEMANA[diaDaSemana(x.dia)]}
                  <br />
                  {x.dia.slice(8)}
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* ── Utilização por laboratório ── */}
        <Card>
          <CardHeader title="Utilização por laboratório" description="Horas reservadas ÷ horas ofertadas (7 dias)." />
          <ul className="space-y-4 p-5">
            {d.porLaboratorio.map((l) => (
              <li key={l.id}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-fg">
                    <span className="mr-2 font-mono text-[11px] text-subtle">{l.codigo}</span>
                    {l.nome}
                  </span>
                  <span className="font-mono text-fg tabular-nums">{pct(l.utilizacao)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                  <div className="h-full rounded-full bg-fg" style={{ width: pct(l.utilizacao) }} />
                </div>
                <p className="mt-1 text-[11px] text-subtle">{l.equipamentos} equipamentos · {l.horas} h reservadas</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* ── Alertas de calibração ── */}
        <Card>
          <CardHeader title="Alertas de calibração" actions={<VerTudo href="/calibracao" />} />
          {d.alertasCalibracao.length === 0 ? (
            <EmptyState title="Tudo em dia" text="Nenhuma calibração vencida ou próxima do vencimento." />
          ) : (
            <ul>
              {d.alertasCalibracao.map((a) => {
                const dias = a.proximaCalibracaoEm ? diasAte(a.proximaCalibracaoEm) : null;
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-fg">{a.nome}</p>
                      <p className="truncate font-mono text-[11px] text-subtle">
                        {a.laboratorioCodigo} · {a.patrimonio ?? "s/ patrimônio"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <CalibracaoBadge situacao={a.situacao} />
                      <p className="mt-1 text-[11px] text-subtle">
                        {dias === null ? "nunca calibrado" : dias < 0 ? `há ${Math.abs(dias)} dias` : `em ${dias} dias`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ── Próximas reservas ── */}
        <Card>
          <CardHeader title="Próximas reservas" actions={<VerTudo href="/agenda" />} />
          {d.proximasReservas.length === 0 ? (
            <EmptyState title="Sem reservas futuras" />
          ) : (
            <ul>
              {d.proximasReservas.map((r) => (
                <li key={r.id} className="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0">
                  <EquipmentIcon tipo={r.equipamento.tipo} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-fg">{r.equipamento.nome}</p>
                    <p className="truncate text-[11px] text-subtle">{r.usuario?.nome}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[12px] text-fg tabular-nums">{formatHora(r.inicio)}</p>
                    <p className="text-[11px] text-subtle">{formatDataCurta(r.inicio)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── Atividade recente ── */}
        <Card>
          <CardHeader title="Atividade recente" actions={<VerTudo href="/auditoria" />} />
          <ul>
            {d.atividade.map((a) => (
              <li key={a.id} className="flex gap-3 border-t border-line px-5 py-3 first:border-t-0">
                <Avatar nome={a.usuarioNome} className="size-7 text-[10px]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug text-fg">{a.resumo}</p>
                  <p className="mt-0.5 text-[11px] text-subtle">
                    {a.usuarioNome} · {tempoRelativo(a.criadoEm)}
                  </p>
                </div>
                <Badge className="hidden shrink-0 sm:inline-flex xl:hidden 2xl:inline-flex">{ACAO_LABEL[a.acao] ?? a.acao}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ── Equipamentos mais demandados ── */}
      <Card>
        <CardHeader title="Equipamentos mais demandados" description="Horas reservadas nos últimos 14 dias — bons candidatos a um segundo equipamento." />
        <div className="grid gap-px bg-line sm:grid-cols-5">
          {d.topEquipamentos.map((e, i) => (
            <div key={e.id} className="bg-surface p-5">
              <p className="font-mono text-[11px] text-subtle">#{i + 1} · {e.laboratorioCodigo}</p>
              <p className="mt-2 truncate text-[13px] font-medium text-fg" title={e.nome}>{e.nome}</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
                {e.horas}
                <span className="ml-1 text-sm font-normal text-subtle">h</span>
              </p>
            </div>
          ))}
        </div>
        <p className="border-t border-line px-5 py-2.5 text-[11px] text-subtle">Atualizado em {formatData(new Date())} às {formatHora(new Date())}</p>
      </Card>
    </div>
  );
}

function Kpi({ label, valor, sufixo, alerta, children }: {
  label: string; valor: string | number; sufixo?: string; alerta?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={cn("glass rounded-2xl border p-5", alerta ? "border-danger/40" : "border-line")}>
      <p className="eyebrow">{label}</p>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className={cn("text-[34px] font-semibold leading-none tracking-[-0.04em] tabular-nums", alerta && "text-danger")}>{valor}</span>
        {sufixo && <span className="text-sm text-subtle">{sufixo}</span>}
      </p>
      <p className="mt-3 text-xs text-muted">{children}</p>
    </div>
  );
}

function VerTudo({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[13px] text-muted transition-colors hover:text-fg">
      Ver tudo <ArrowRight className="size-3.5" />
    </Link>
  );
}
