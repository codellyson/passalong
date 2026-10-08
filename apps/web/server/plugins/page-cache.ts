// The public pages, rendered once per colo rather than once per visit.
//
// Cloudflare's CDN does not cache what a Worker returns on a custom domain — the Worker *is* the
// origin — so a `cache-control` header alone changes nothing, and every hit on `/` used to be a
// full Vue render. TTFB measured 1–20s on the landing and the docs, which is the slowest thing a
// crawler sees on the site.
//
// Prerendering would not do: the pages are not quite static. The theme switch is a cookie the
// server reads before it renders (app/app.vue), so one path has three correct documents. Those go
// in the Workers Cache API instead, keyed by:
//
//   - the build id, so a deploy is the invalidation. Copy only changes by deploying, so nothing
//     else needs to purge.
//   - the theme cookie, normalised to light / dark / system.
//   - the path. Requests with a query string are not cached: AppThemeToggle writes the full path,
//     query and all, into the page, and one visitor's query has no business in another's page.
//
// A request carrying a session cookie never touches the cache, in either direction. The masthead
// says "Open hub" to somebody signed in (AppMasthead), so that render is not the page everyone
// else should be handed, and keying on it would only split the cache for the few visitors who
// have one. Without this the first signed-in visit to a path stored its masthead for everybody.
//
// Only pages listed as published in shared/pages.ts, and blog posts once the blog is. The hub, the
// share links and every flow with a session never reach the cache.
//
// Route-rule headers (the CSP) are not stored: they are applied to the event on every request,
// hit or miss, before the renderer runs. What is stored is what the renderer itself returned.
import { published } from "#shared/pages";
import { hasSession } from "../../app/utils/session";

/** How long a colo keeps a page. The build id in the key is what retires it on a deploy. */
const EDGE_TTL = 60 * 60 * 24;

const cacheable = (path: string) =>
  published(path) || (published("/blog") && path.startsWith("/blog/"));

const edgeCache = (): Cache | undefined =>
  (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches?.default;

function keyFor(event: Parameters<typeof getRequestURL>[0]): string | undefined {
  if (event.method !== "GET") return undefined;
  const url = getRequestURL(event);
  if (url.search || !cacheable(url.pathname)) return undefined;
  if (hasSession(getHeader(event, "cookie"))) return undefined;
  const cookie = getCookie(event, "theme");
  const theme = cookie === "light" || cookie === "dark" ? cookie : "system";
  const build = useRuntimeConfig().app.buildId || "dev";
  // A URL on our own origin that nothing serves. The Cache API wants a URL; the path segments
  // are the key.
  return `${url.origin}/__page-cache/${build}/${theme}${url.pathname}`;
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("render:before", async (ctx) => {
    const cache = edgeCache();
    const key = cache && keyFor(ctx.event);
    if (!cache || !key) return;
    const hit = await cache.match(key);
    if (!hit) {
      setResponseHeader(ctx.event, "x-page-cache", "miss");
      return;
    }
    const headers: Record<string, string> = {};
    hit.headers.forEach((value, name) => {
      if (name !== "cache-control") headers[name] = value;
    });
    headers["x-page-cache"] = "hit";
    ctx.response = { body: await hit.text(), statusCode: 200, headers };
  });

  nitroApp.hooks.hook("render:response", (response, ctx) => {
    const cache = edgeCache();
    const key = cache && keyFor(ctx.event);
    if (!cache || !key) return;
    // A hit arrives here too; it is already in the cache.
    if (response.headers?.["x-page-cache"] === "hit") return;
    if ((response.statusCode ?? 200) !== 200 || typeof response.body !== "string") return;
    // Nothing that sets a cookie is shared between visitors.
    if (ctx.event.node.res.hasHeader("set-cookie")) return;

    const headers = new Headers();
    for (const [name, value] of Object.entries(response.headers ?? {})) {
      if (value !== undefined) headers.set(name, String(value));
    }
    headers.set("cache-control", `public, s-maxage=${EDGE_TTL}`);
    const put = cache.put(key, new Response(response.body, { headers }));
    const waitUntil = ctx.event.context.cloudflare?.context?.waitUntil?.bind(
      ctx.event.context.cloudflare.context,
    );
    if (waitUntil) waitUntil(put);
    else ctx.event.waitUntil(put);
  });
});
