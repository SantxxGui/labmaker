import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const TIMEZONE = "America/Sao_Paulo";

const fmtHora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIMEZONE,
});
const fmtDataCurta = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: TIMEZONE,
});

export const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const formatHora = (d: Date | string) => fmtHora.format(new Date(d));
export const formatDataCurta = (d: Date | string) =>
  capitalizar(fmtDataCurta.format(new Date(d)).replace(/\./g, ""));

/** Fetch JSON com erro tipado (usa a mensagem `error` da API). */
export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Falha na requisição.");
  return data as T;
}

const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TIMEZONE });
const fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE,
});
/** 16/11/2026 */
export const formatData = (d: Date | string) => fmtData.format(new Date(d));
/** 16/11 14:30 */
export const formatDataHora = (d: Date | string) => fmtDataHora.format(new Date(d)).replace(",", "");

/** "há 5 min", "há 3 h", "há 2 d" */
export function tempoRelativo(d: Date | string, agora = Date.now()) {
  const min = Math.max(0, Math.round((agora - new Date(d).getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} d`;
}

/** Dias inteiros até uma data (negativo = já passou). */
export function diasAte(d: Date | string, agora = Date.now()) {
  return Math.ceil((new Date(d).getTime() - agora) / 86_400_000);
}
