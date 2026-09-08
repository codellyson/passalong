// The API Worker, mounted. This is what replaced the HTTP proxy the port ran behind: the Hono app
// from apps/api is imported and handed the request directly, so `/v1/*` costs no extra hop and the
// thirty routes behind it are unchanged — the CLI and the MCP servers cannot tell the difference.
//
// Three surfaces stay with Hono rather than becoming Nuxt routes:
//
//   /v1/*                   the machine API, and the contract published CLIs point at
//   /g/:id/:key.md          a guide's raw markdown, which records a pull
//   /g/:id/:key/og.png      the unfurl card; `workers-og` is ~1.7MB of wasm behind a dynamic
//                           import, so every other route would pay for it on a cold start
//   /health                 what CI waits on after a deploy, on both serving hosts
//
// Everything else — including the guide *page* at /g/:id/:key — falls through to Nuxt. The match
// is written out rather than delegated to Hono's own router because a miss must fall through
// here, and handing the request over would instead produce Hono's 404.
import api from "#api/index";

const MACHINE_ROUTE = /^\/g\/[^/]+\/[^/]+(?:\.md|\/og\.png)$/;

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
    !MACHINE_ROUTE.test(path) &&
    !OAUTH_ROUTE.test(path)
  ) {
    return;
  }

  const cf = event.context.cloudflare as
    | { env?: Record<string, unknown>; context?: ExecutionContext }
    | undefined;
  return api.fetch(toWebRequest(event), cf?.env ?? {}, cf?.context);
});
