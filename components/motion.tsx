"use client";

/**
 * Primitivas de animação do LabMaker (framer-motion).
 * Todas respeitam "reduzir movimento" do sistema operacional.
 */
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform, type HTMLMotionProps } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Número que conta até o valor (e anima nas mudanças). */
export function NumeroAnimado({ valor, casas = 0, sufixo = "", className, duracao = 0.9 }: {
  valor: number; casas?: number; sufixo?: string; className?: string; duracao?: number;
}) {
  const reduzir = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const visivel = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(0);
  const texto = useTransform(mv, (v) =>
    `${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}${sufixo}`,
  );
  useEffect(() => {
    if (!visivel) return;
    if (reduzir) {
      mv.set(valor);
      return;
    }
    const c = animate(mv, valor, { duration: duracao, ease: EASE });
    return () => c.stop();
  }, [valor, visivel, reduzir, mv, duracao]);
  return <motion.span ref={ref} className={cn("tabular-nums", className)}>{texto}</motion.span>;
}

/** Entrada suave (sobe + aparece). Use `i` para escalonar itens de uma lista. */
export function Surgir({ i = 0, className, children, ...rest }: { i?: number } & HTMLMotionProps<"div">) {
  const reduzir = useReducedMotion();
  return (
    <motion.div
      initial={reduzir ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: Math.min(i, 12) * 0.045 }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Revela ao entrar na tela durante a rolagem. */
export function Revelar({ className, children, atraso = 0, ...rest }: { atraso?: number } & HTMLMotionProps<"div">) {
  const reduzir = useReducedMotion();
  return (
    <motion.div
      initial={reduzir ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: EASE, delay: atraso }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Cartão com holofote que segue o cursor (luz branca discreta, sem degradê em texto). */
export function Holofote({ className, children, as: Tag = "div" }: { className?: string; children: React.ReactNode; as?: "div" | "li" | "article" }) {
  const ref = useRef<HTMLElement>(null);
  return (
    <Tag
      ref={ref as never}
      onPointerMove={(e: React.PointerEvent) => {
        const r = ref.current!.getBoundingClientRect();
        ref.current!.style.setProperty("--mx", `${e.clientX - r.left}px`);
        ref.current!.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      className={cn("holofote relative overflow-hidden", className)}
    >
      {children}
    </Tag>
  );
}

/** Texto que troca de palavra em ciclo (efeito máquina de escrever). */
export function PalavraRotativa({ palavras, className, intervalo = 2600 }: { palavras: string[]; className?: string; intervalo?: number }) {
  const [i, setI] = useState(0);
  const reduzir = useReducedMotion();
  useEffect(() => {
    if (reduzir) return;
    const id = setInterval(() => setI((v) => (v + 1) % palavras.length), intervalo);
    return () => clearInterval(id);
  }, [palavras.length, intervalo, reduzir]);
  return (
    <span className={cn("relative inline-grid", className)}>
      {palavras.map((p, k) => (
        <motion.span
          key={p}
          aria-hidden={k !== i}
          initial={false}
          animate={k === i ? { opacity: 1, y: "0%", filter: "blur(0px)" } : { opacity: 0, y: k === (i + palavras.length - 1) % palavras.length ? "-40%" : "40%", filter: "blur(6px)" }}
          transition={{ duration: 0.55, ease: EASE }}
          className="col-start-1 row-start-1 whitespace-nowrap"
        >
          {p}
        </motion.span>
      ))}
    </span>
  );
}

/** Faixa que rola infinitamente (letreiro). */
export function Letreiro({ children, className, duracao = 40 }: { children: React.ReactNode; className?: string; duracao?: number }) {
  return (
    <div className={cn("letreiro group relative flex overflow-hidden", className)}>
      {[0, 1].map((k) => (
        <div key={k} aria-hidden={k === 1} className="letreiro-faixa flex shrink-0 items-center gap-10 pr-10" style={{ animationDuration: `${duracao}s` }}>
          {children}
        </div>
      ))}
    </div>
  );
}

/** Anel de progresso (conformidade, uso de CPU…). */
export function Anel({ valor, tamanho = 64, espessura = 6, cor = "var(--fg)", className, children }: {
  valor: number; tamanho?: number; espessura?: number; cor?: string; className?: string; children?: React.ReactNode;
}) {
  const r = (tamanho - espessura) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("relative grid place-items-center", className)} style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="-rotate-90" aria-hidden>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={espessura} />
        <motion.circle
          cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke={cor} strokeWidth={espessura} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, valor / 100))) }}
          transition={{ duration: 1, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
