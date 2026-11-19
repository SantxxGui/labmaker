/**
 * Web Push — notificação no celular mesmo com a página /agente fechada (precisa de HTTPS).
 * As chaves VAPID são geradas na primeira vez e guardadas no banco (config_sistema);
 * em produção dá para fixá-las com VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
 */
import "server-only";
import webpush from "web-push";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ConfigModel } from "@/models/chamado.model";

let chaves: { publicKey: string; privateKey: string } | null = null;

export async function chavesVapid() {
  if (chaves) return chaves;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    chaves = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const salvo = await ConfigModel.ler("vapid");
    chaves = salvo ? JSON.parse(salvo) : webpush.generateVAPIDKeys();
    if (!salvo) await ConfigModel.gravar("vapid", JSON.stringify(chaves));
  }
  webpush.setVapidDetails(process.env.VAPID_CONTATO ?? "mailto:lider@labmaker.dev", chaves!.publicKey, chaves!.privateKey);
  return chaves!;
}

/**
 * Manda uma notificação para o aparelho, se ele tiver inscrição push. Nunca derruba quem chamou:
 * sem inscrição, sem internet ou inscrição vencida (o banco é limpo) → só registra no log.
 */
export async function notificarAparelho(dispositivoId: string, n: { titulo: string; corpo: string; tag?: string }) {
  try {
    const d = await prisma.dispositivo.findUnique({ where: { id: dispositivoId }, select: { pushInscricao: true } });
    if (!d?.pushInscricao) return false;
    await chavesVapid();
    await webpush.sendNotification(d.pushInscricao as unknown as webpush.PushSubscription, JSON.stringify({ ...n, url: "/agente" }), { TTL: 600, urgency: "high" });
    return true;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) await prisma.dispositivo.update({ where: { id: dispositivoId }, data: { pushInscricao: Prisma.DbNull } }).catch(() => {});
    console.warn(`[push] não entregue para ${dispositivoId}: ${status ?? (e as Error).message}`);
    return false;
  }
}
