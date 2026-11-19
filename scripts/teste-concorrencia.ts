/**
 * Teste de concorrência — `npm run test:concorrencia` (servidor rodando).
 * 5 alunos disparam 10 pedidos cada, AO MESMO TEMPO, para o mesmo horário da mesma máquina.
 * Esperado: exatamente 1 reserva confirmada e 49 recusas (409). Prova a trava pg_advisory_xact_lock.
 */
import { BASE, Cliente, confere, prepararMaquina, proximoDiaUtil, resumo, unico } from "./_cliente";

const ALUNOS = Number(process.env.ALUNOS ?? 5);
const PEDIDOS = Number(process.env.PEDIDOS ?? 10);

async function main() {
  console.log(`LabMaker · concorrência em ${BASE}: ${ALUNOS} alunos × ${PEDIDOS} pedidos simultâneos\n`);
  const lider = await new Cliente("Líder").login(process.env.LIDER_EMAIL ?? "lider@labmaker.dev");
  const maq = await prepararMaquina(lider);

  const alunos = await Promise.all(Array.from({ length: ALUNOS }, async (_, i) => {
    const c = new Cliente(`aluno${i}`);
    const r = await c.post("/api/auth/cadastro", { nome: `Aluno Concorrente ${i}`, email: `conc.${unico()}@teste.dev`, senha: "senhaforte1" });
    if (r.status !== 201) throw new Error(`cadastro falhou: ${r.status}`);
    return c;
  }));

  const dia = proximoDiaUtil(3);
  const slot = ((await alunos[0].get(`/api/equipamentos/${maq.id}/disponibilidade?data=${dia}`)).json?.slots ?? []).find((s: { disponivel: boolean }) => s.disponivel);
  if (!slot) throw new Error("Sem horário livre para o teste.");

  const t0 = performance.now();
  const resultados = await Promise.all(
    alunos.flatMap((a) => Array.from({ length: PEDIDOS }, () => a.post("/api/agendamentos", { equipamentoId: maq.id, inicio: slot.inicio, finalidade: "corrida" }).then((r) => r.status))),
  );
  const ms = Math.round(performance.now() - t0);
  const conta = resultados.reduce<Record<number, number>>((m, s) => ((m[s] = (m[s] ?? 0) + 1), m), {});
  console.log(`  ${resultados.length} pedidos em ${ms} ms →`, conta, "\n");

  confere("exatamente 1 reserva confirmada", conta[201] === 1);
  confere("todas as outras recusadas com 409", conta[409] === resultados.length - 1);
  confere("nenhum erro 500", !conta[500]);
  const agenda: { equipamento: { id: string }; inicio: string; status: string }[] = (await lider.get("/api/agendamentos?escopo=todas")).json?.agendamentos ?? [];
  const noSlot = agenda.filter((a) => a.equipamento.id === maq.id && +new Date(a.inicio) === +new Date(slot.inicio) && a.status === "CONFIRMADO");
  confere("o banco tem uma única reserva no horário", noSlot.length === 1, `${noSlot.length} encontrada(s)`);
  resumo();
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
