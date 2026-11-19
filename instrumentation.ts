/**
 * Roda uma vez quando o servidor Next.js sobe.
 * Liga o agendador de automações (lembrete de devolução e atraso por push) — ver lib/agendador.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { iniciarAgendador } = await import("./lib/agendador");
  iniciarAgendador();
}
