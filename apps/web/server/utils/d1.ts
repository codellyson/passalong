// The D1 handle, from wherever the runtime keeps it. On Workers, Nitro puts the bindings on
// `event.context.cloudflare.env`; there is no binding at all under `nuxt dev`, so callers get a
// clear failure rather than a property access on undefined.
import type { H3Event } from "h3";

/** Only what this app actually calls. The full surface is in @cloudflare/workers-types. */
export interface D1 {
  prepare(query: string): {
    bind(...values: unknown[]): { first<T>(): Promise<T | null> };
  };
}

export function db(event: H3Event): D1 {
  const binding = (event.context.cloudflare as { env?: { DB?: D1 } } | undefined)?.env?.DB;
  if (!binding) {
    throw createError({
      statusCode: 503,
      statusMessage: "no database binding — run against `wrangler dev`, not `nuxt dev`",
    });
  }
  return binding;
}
