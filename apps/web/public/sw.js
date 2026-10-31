// Passalong's service worker. It does two things: shows a push when the hub is not in front of you
// (and opens the work it is about when clicked), and receives what a phone shares to Passalong.
//
// Its fetch handler answers exactly one request, the POST the phone's Share menu sends to
// /hub/share (`share_target` in site.webmanifest). Every other request it leaves alone, without
// answering, so the pages it controls — work pages included, whose safety is their no-script
// policy — load exactly as they would without it. See apps/api/src/webpush.ts for how a push is
// sent and why nobody in between can read it.

/** Where a share waits for the box to pick it up; the box empties it. */
const SHARED = "passalong-shared";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// A share holds no credential, so nothing is uploaded here: the pictures and words are kept in this
// browser and the box, signed in, uploads them as if they were pasted.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.origin !== self.location.origin) return;
  if (url.pathname !== "/hub/share") return;
  event.respondWith(
    (async () => {
      const form = await event.request.formData().catch(() => null);
      const cache = await caches.open(SHARED);
      for (const key of await cache.keys()) await cache.delete(key);
      if (form) {
        const words = ["title", "text", "url"]
          .map((k) => String(form.get(k) || "").trim())
          .filter((w, i, all) => w && all.indexOf(w) === i)
          .join("\n\n");
        await cache.put("/shared/text", new Response(words));
        const files = form
          .getAll("files")
          .filter((f) => f instanceof File && f.type.startsWith("image/"));
        for (const [i, f] of files.slice(0, 5).entries())
          await cache.put(
            `/shared/file/${i}`,
            new Response(f, {
              headers: {
                "content-type": f.type,
                "x-name": encodeURIComponent(f.name || "picture"),
              },
            }),
          );
      }
      return Response.redirect("/hub/new?shared=1", 303);
    })(),
  );
});

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
      if (looking && !m.always) {
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
