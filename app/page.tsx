import { prisma } from "@/lib/prisma";
import { Landing } from "@/views/landing/landing";

export const dynamic = "force-dynamic";

/** Página inicial pública: mostra quantas máquinas e aparelhos o espaço tem de verdade. */
export default async function HomePage() {
  const contagem = await Promise.all([
    prisma.equipamento.count({ where: { ativo: true } }),
    prisma.dispositivo.count({ where: { ativo: true } }),
  ]).then(([maquinas, aparelhos]) => ({ maquinas, aparelhos })).catch(() => null); // banco fora do ar não derruba a landing
  return <Landing contagem={contagem} />;
}
