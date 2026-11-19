/* Service worker do agente LabMaker (PWA).
 * - push: mostra a notificação mesmo com a página fechada (aviso do Líder, mensagem do chat, lembrete de devolução)
 * - notificationclick: abre (ou foca) a página do agente
 * Não guarda cache de páginas: o agente precisa estar sempre conversando com o servidor. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corpo: e.data && e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(d.titulo || "LabMaker", {
      body: d.corpo || "",
      tag: d.tag || "labmaker",
      renotify: true,
      icon: "/icones/icone-192.png",
      badge: "/icones/icone-192.png",
      vibrate: [250, 120, 250],
      data: { url: "/agente" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abertas) => {
      const aberta = abertas.find((c) => new URL(c.url).pathname.startsWith("/agente"));
      return aberta ? aberta.focus() : self.clients.openWindow("/agente");
    }),
  );
});
