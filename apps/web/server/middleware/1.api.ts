// The API Worker, mounted. This is what replaced the HTTP proxy the port ran behind: the Hono app
// from apps/api is imported and handed the request directly, so `/v1/*` costs no extra hop and the
// thirty routes behind it are unchanged — the CLI and the MCP servers cannot tell the difference.
//
// Three surfaces stay with Hono rather than becoming Nuxt routes:
//
//   /v1/*                   the machine API, and the contract released CLIs point at
//   /w/:id/:key.md          a piece of work's raw markdown, which records a pull
//   /w/:id/:key/og.png      the unfurl card; `workers-og` is ~1.7MB of wasm behind a dynamic
//                           import, so every other route would pay for it on a cold start
//   /og.png                 the site's own card, same renderer and same reason
//   /health                 what CI waits on after a deploy, on both serving hosts
//
// Everything else — including the work *page* at /w/:id/:key — falls through to Nuxt. The match
// is written out rather than delegated to Hono's own router because a miss must fall through
// here, and handing the request over would instead produce Hono's 404.
import api from "#api/index";
import { routeOf, SLOW_MS, serverTiming, type Timing, timedDB } from "#api/timing";

const MACHINE_ROUTE = /^\/w\/[^/]+\/[^/]+(?:\.md|\/og\.png)$/;

/** The site's own unfurl card, rendered by the same workers-og import and for the same reason. */
const SITE_CARD = "/og.png";

/**
 * OAuth's own surfaces, which are Hono's too.
 *
 * `/.well-known/*` is where a client looks before it has a credential, and `/oauth/authorize` is
 * where it sends the browser — both answered by the mounted app. `/oauth/consent` is deliberately
 * not here: that one is a page, because approving a grant is something a person reads.
 */
const OAUTH_ROUTE = /^\/(?:\.well-known\/oauth-[a-z-]+(?:\/.*)?|oauth\/authorize)$/;

export default defineEventHandler(async (event) => {
  const path = event.path.split("?")[0] as string;
  if (
    path !== "/health" &&
    !path.startsWith("/v1/") &&
    path !== SITE_CARD &&
    !MACHINE_ROUTE.test(path) &&
    !OAUTH_ROUTE.test(path)
  ) {
    return;
  }

  const cf = event.context.cloudflare as
    | { env?: Record<string, unknown>; context?: ExecutionContext }
    | undefined;
  // Timed, with this request's database counted (#api/timing): every answer says what it cost in
  // `Server-Timing`, and a slow one is logged by route, so a slow hub can be traced to a request.
  const timing: Timing = { queries: 0, db: 0 };
  const env = { ...(cf?.env ?? {}) };
  if (env.DB && typeof env.DB === "object") env.DB = timedDB(env.DB, timing);
  const start = performance.now();
  const res = await api.fetch(toWebRequest(event), env, cf?.context);
  const total = performance.now() - start;
  if (total >= SLOW_MS)
    console.log(
      JSON.stringify({
        slow: `${event.method} ${routeOf(path)}`,
        status: res.status,
        ms: Math.round(total),
        db_ms: Math.round(timing.db),
        queries: timing.queries,
      }),
    );
  // A switch of protocols carries no headers of ours; every other answer gets the timing.
  if (res.status === 101) return res;
  const timed = new Response(res.body, res);
  timed.headers.append("server-timing", serverTiming(total, timing));
  return timed;
});
