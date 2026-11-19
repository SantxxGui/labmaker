"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Datas são strings "YYYY-MM-DD" (dia de calendário, sem fuso). */
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function MiniCalendar({
  value,
  onChange,
  onHoverDay,
  min,
  max,
  isDisabled,
  marcados,
}: {
  value: string;
  onChange: (iso: string) => void;
  /** Usado para pré-carregar a disponibilidade ao passar o mouse */
  onHoverDay?: (iso: string) => void;
  min: string;
  max: string;
  isDisabled?: (iso: string) => boolean;
  /** Dias com reserva do usuário (ganham um ponto) */
  marcados?: Set<string>;
}) {
  const [cursor, setCursor] = useState(() => {
    const [y, m] = value.split("-").map(Number);
    return { y, m: m - 1 };
  });
  const [direcao, setDirecao] = useState(0);

  const semanas = useMemo(() => {
    const primeiroDiaSemana = new Date(Date.UTC(cursor.y, cursor.m, 1)).getUTCDay();
    const diasNoMes = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
    const celulas: (string | null)[] = [
      ...Array.from({ length: primeiroDiaSemana }, () => null),
      ...Array.from({ length: diasNoMes }, (_, i) => iso(cursor.y, cursor.m, i + 1)),
    ];
    while (celulas.length % 7) celulas.push(null);
    return Array.from({ length: celulas.length / 7 }, (_, i) => celulas.slice(i * 7, i * 7 + 7));
  }, [cursor]);

  const chaveMes = `${cursor.y}-${pad(cursor.m + 1)}`;
  const podeVoltar = chaveMes > min.slice(0, 7);
  const podeAvancar = chaveMes < max.slice(0, 7);

  function mudarMes(delta: number) {
    setDirecao(delta);
    setCursor(({ y, m }) => {
      const t = m + delta;
      return { y: y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
    });
  }

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center justify-between">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={chaveMes}
            initial={{ opacity: 0, y: direcao * 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: direcao * -6 }}
            className="text-sm font-medium text-fg"
          >
            {MESES[cursor.m]} <span className="text-subtle">{cursor.y}</span>
          </motion.p>
        </AnimatePresence>
        <div className="flex gap-0.5">
          {[
            { d: -1, Icon: ChevronLeft, ok: podeVoltar, label: "Mês anterior" },
            { d: 1, Icon: ChevronRight, ok: podeAvancar, label: "Próximo mês" },
          ].map(({ d, Icon, ok, label }) => (
            <button
              key={d}
              type="button"
              disabled={!ok}
              onClick={() => mudarMes(d)}
              aria-label={label}
              className="grid size-7 place-items-center rounded-md text-muted transition hover:bg-raised hover:text-fg disabled:pointer-events-none disabled:opacity-30"
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 text-center font-mono text-[10.5px] text-subtle">
        {SEMANA.map((s, i) => (
          <span key={i} className="py-1.5">
            {s}
          </span>
        ))}
      </div>

      <AnimatePresence mode="popLayout" initial={false} custom={direcao}>
        <motion.div
          key={chaveMes}
          custom={direcao}
          initial={{ opacity: 0, x: direcao * 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direcao * -24 }}
          transition={{ duration: 0.25, ease: [0.21, 0.47, 0.32, 0.98] }}
          className="grid grid-cols-7 gap-y-1"
          role="grid"
        >
          {semanas.flat().map((dia, i) => {
            if (!dia) return <span key={`v${i}`} />;
            const foraDaJanela = dia < min || dia > max;
            const bloqueado = foraDaJanela || !!isDisabled?.(dia);
            const selecionado = dia === value;
            const hoje = dia === min;
            return (
              <div key={dia} className="flex justify-center">
                <button
                  type="button"
                  role="gridcell"
                  aria-selected={selecionado}
                  aria-label={dia}
                  disabled={bloqueado}
                  onClick={() => onChange(dia)}
                  onMouseEnter={() => !bloqueado && onHoverDay?.(dia)}
                  className={cn(
                    "relative grid size-9 place-items-center rounded-md text-[13px] tabular-nums transition-colors duration-150",
                    !bloqueado && !selecionado && "text-fg hover:bg-raised",
                    selecionado && "bg-accent font-semibold text-accent-fg",
                    bloqueado && "cursor-not-allowed text-subtle/50",
                    hoje && !selecionado && "ring-1 ring-inset ring-line-strong",
                  )}
                >
                  {Number(dia.slice(8))}
                  {marcados?.has(dia) && (
                    <span
                      className={cn(
                        "absolute bottom-1 size-1 rounded-full",
                        selecionado ? "bg-accent-fg" : "bg-info",
                      )}
                    />
                  )}
                </button>
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
