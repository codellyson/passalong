// Passalong's service worker. It does one thing: shows a push when the hub is not in front of you,
// and opens the guide it is about when clicked.
//
// It has no fetch handler, on purpose. It never sees or answers a request, so the pages it controls
// — guide pages included, whose safety is their no-script policy — load exactly as they would
// without it. See apps/api/src/webpush.ts for how a push is sent and why nobody in between can read
// it.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let m = {};
  try {
    m = event.data ? event.data.json() : {};
  } catch {}
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Somebody looking at the hub gets the toast there instead. A push must still show something
      // or the browser shows its own "updated in the background" notice, so it is shown and closed.
      const looking = windows.some(
        (w) =>
          w.focused &&
          w.visibilityState === "visible" &&
          new URL(w.url).pathname.startsWith("/hub"),
      );
      await self.registration.showNotification(m.title || "Passalong", {
        body: m.body || "",
        tag: m.tag || "passalong",
        data: { url: m.url || "/hub" },
        icon: "/icon-192.png",
        badge: "/icon-192.png",
      });
      if (looking) {
        const shown = await self.registration.getNotifications({ tag: m.tag || "passalong" });
        for (const n of shown) n.close();
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/hub", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        return open.navigate(target);
      }
      return self.clients.openWindow(target);
    })(),
  );
});
