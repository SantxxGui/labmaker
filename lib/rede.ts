/** Endereços de rede deste servidor — para o QR code e o comando do agente apontarem para o lugar certo. */
import "server-only";
import os from "node:os";

export function enderecosDaRede(porta: string) {
  const r: { interface: string; ip: string; url: string; tipo: "wifi" | "cabo" | "virtual" | "outro" }[] = [];
  for (const [nome, lista] of Object.entries(os.networkInterfaces())) {
    for (const e of lista ?? []) {
      if (e.internal || e.family !== "IPv4" || e.address.startsWith("169.254.")) continue;
      const n = nome.toLowerCase();
      const tipo = /wi-?fi|wlan|wireless|wlp|airport/.test(n) ? "wifi" : /vbox|vmnet|virtual|docker|veth|br-|hyper-v|vethernet|wsl|tailscale|zerotier/.test(n) ? "virtual" : /eth|en|ethernet|ether/.test(n) ? "cabo" : "outro";
      r.push({ interface: nome, ip: e.address, url: `http://${e.address}:${porta}`, tipo });
    }
  }
  // Wi-Fi e cabo primeiro (o que o celular e a rede enxergam); interfaces virtuais por último
  const ordem = { wifi: 0, cabo: 1, outro: 2, virtual: 3 };
  return r.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
}

/** A requisição chegou por HTTPS? (direto, ou atrás de túnel/proxy que avisa em X-Forwarded-Proto) */
export function viaHttps(req: Request) {
  return req.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https" || new URL(req.url).protocol === "https:";
}

export function portaDe(req: Request) {
  const host = req.headers.get("host") ?? "";
  return host.match(/:(\d+)$/)?.[1] ?? process.env.PORT ?? "3000";
}
