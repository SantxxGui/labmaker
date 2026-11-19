/**
 * Seed — dois modos:
 *
 *   npm run db:reset   → ZERADO (padrão): nenhuma máquina, área, notebook, reserva ou empréstimo.
 *                        Só a conta do Líder do espaço, a unidade e duas políticas-modelo.
 *                        O Líder cadastra tudo pela aplicação; os alunos criam a própria conta em /cadastro.
 *   npm run db:demo    → DEMONSTRAÇÃO: espaço completo com dados de exemplo (prisma/seed-data.ts).
 *
 * Conta inicial: variáveis LIDER_EMAIL / LIDER_SENHA / LIDER_NOME no .env.
 */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { SENHA_DEMO, gerarDadosDemo, gerarDadosIniciais } from "./seed-data";

export { SENHA_DEMO };

export type ModoSeed = "zerado" | "demo";

export async function seed(modo: ModoSeed = "zerado") {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Defina DATABASE_URL no arquivo .env");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    // Limpeza na ordem das chaves estrangeiras. A auditoria é imutável no banco (trigger):
    // só a transação do seed liga a chave de manutenção que libera o DELETE.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('labmaker.manutencao', 'on', true)`;
      await tx.registroAuditoria.deleteMany();
      await tx.tentativaLogin.deleteMany();
      await tx.mensagemSuporte.deleteMany();
      await tx.chamado.deleteMany();
      await tx.emprestimo.deleteMany();
      await tx.eventoDispositivo.deleteMany();
      await tx.acaoDispositivo.deleteMany();
      await tx.dispositivo.deleteMany();
      await tx.politicaDispositivo.deleteMany();
      await tx.comandoRemoto.deleteMany();
      await tx.alarme.deleteMany();
      await tx.manutencao.deleteMany();
      await tx.agendamento.deleteMany();
      await tx.equipamento.deleteMany();
      await tx.laboratorio.deleteMany();
      await tx.unidade.deleteMany();
      await tx.usuario.deleteMany();
    });

    if (modo === "zerado") {
      const z = gerarDadosIniciais(process.env);
      const senhaLider = process.env.LIDER_SENHA ?? SENHA_DEMO;
      const [l] = z.usuarios;
      await prisma.usuario.create({ data: { ...l, senhaHash: await bcrypt.hash(senhaLider, 10) } });
      await prisma.unidade.create({ data: z.unidade });
      await prisma.politicaDispositivo.createMany({ data: z.politicas });
      await prisma.registroAuditoria.create({
        data: { acao: "sistema.inicializado", entidade: "sistema", resumo: "Espaço criado do zero: conta do Líder", usuarioNome: "Instalação" },
      });
      console.log("✔ Banco ZERADO: nenhuma máquina, área, notebook ou reserva.");
      console.log(`  Líder do espaço : ${l.email}  (senha ${process.env.LIDER_SENHA ? "do .env" : SENHA_DEMO})  ← cuida de tudo`);
      console.log("  Alunos criam a própria conta em /cadastro.  Dados de exemplo: npm run db:demo");
      if (!process.env.LIDER_SENHA) console.log("  ⚠ Troque a senha padrão em produção (LIDER_SENHA no .env).");
      return;
    }

    const d = gerarDadosDemo(new Date());
    const senhaHash = await bcrypt.hash(SENHA_DEMO, 10);
    await prisma.usuario.createMany({ data: d.usuarios.map((u) => ({ ...u, senhaHash })) });
    await prisma.unidade.createMany({ data: d.unidades });
    await prisma.laboratorio.createMany({ data: d.laboratorios });
    await prisma.equipamento.createMany({ data: d.equipamentos });
    await prisma.manutencao.createMany({ data: d.manutencoes });
    await prisma.agendamento.createMany({ data: d.agendamentos });
    await prisma.registroAuditoria.createMany({ data: d.auditoria });
    await prisma.alarme.createMany({ data: d.alarmes });
    await prisma.comandoRemoto.createMany({ data: d.comandos });
    await prisma.politicaDispositivo.createMany({ data: d.politicas });
    await prisma.dispositivo.createMany({ data: d.dispositivos });
    await prisma.acaoDispositivo.createMany({ data: d.acoesDispositivo });
    await prisma.eventoDispositivo.createMany({ data: d.eventosDispositivo });
    await prisma.emprestimo.createMany({ data: d.emprestimos });

    console.log(`✔ Seed concluído: ${d.equipamentos.length} equipamentos, ${d.dispositivos.length} dispositivos, ${d.agendamentos.length} reservas, ${d.usuarios.length} usuários`);
    console.log(`  Contas (senha ${SENHA_DEMO}): lider@ · gestor@ · usuario@labmaker.dev`);
  } finally {
    await prisma.$disconnect();
  }
}

// Executado diretamente (npm run db:seed)?
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed(process.argv.includes("--demo") ? "demo" : "zerado").catch((e) => {
    console.error("✖ Falha no seed:", e.message ?? e);
    process.exit(1);
  });
}
