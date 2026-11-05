/**
 * How long one API request took, and how much of that was the database.
 *
 * The hub felt slow, and from outside only the network could be measured: about 180 ms each way
 * from Nigeria to Cloudflare's Amsterdam edge, against some 30 ms of the Worker's own for a
 * request that reads one row (2026-11-06). What a signed-in request costs could not be seen from
 * there. So every API response says it in a `Server-Timing` header, which a browser's developer
 * tools show beside each request, and a slow one is written to the log with its route.
 *
 * The database is counted by wrapping the request's own `DB` binding (apps/web/server/middleware/
 * 1.api.ts), so the app's calls to itself are counted with the request that made them. Clocks in a
 * Worker move only while it waits on something, which is exactly the time worth seeing here.
 *
 * Imports no sibling `.ts`, so its tests can import it.
 */

export interface Timing {
  /** Statements run: each `first`, `all`, `run` or `raw`, and each statement in a batch. */
  queries: number;
  /** Milliseconds spent waiting on the database. Overlapping waits each count in full. */
  db: number;
}

/** A request this slow or slower is logged with its route. */
export const SLOW_MS = 500;

const RUNS = new Set(["first", "all", "run", "raw"]);

/**
 * The database as this request sees it: the same binding, with each statement it runs timed into
 * `t`. Statements are wrapped rather than copied, and a batch is handed the originals, so the
 * binding gets back exactly what it made.
 */
export function timedDB<T extends object>(db: T, t: Timing, clock = () => performance.now()): T {
  const original = new WeakMap<object, object>();
  const timed = async <R>(work: () => Promise<R>, statements: number): Promise<R> => {
    const start = clock();
    try {
      return await work();
    } finally {
      t.queries += statements;
      t.db += clock() - start;
    }
  };
  const statement = (s: object): object => {
    const wrapped = new Proxy(s, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (typeof value !== "function") return value;
        if (prop === "bind")
          return (...args: unknown[]) => statement(value.apply(target, args) as object);
        if (typeof prop === "string" && RUNS.has(prop))
          return (...args: unknown[]) => timed(() => value.apply(target, args), 1);
        return value.bind(target);
      },
    });
    original.set(wrapped, s);
    return wrapped;
  };
  return new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      if (prop === "prepare")
        return (...args: unknown[]) => statement(value.apply(target, args) as object);
      if (prop === "batch")
        return (statements: object[], ...rest: unknown[]) =>
          timed(
            () => value.apply(target, [statements.map((s) => original.get(s) ?? s), ...rest]),
            statements.length,
          );
      return value.bind(target);
    },
  });
}

/** The `Server-Timing` header: the whole request, and the database's share with its count. */
export function serverTiming(total: number, t: Timing): string {
  const ms = (n: number) => Math.round(n * 10) / 10;
  return `app;dur=${ms(total)}, db;dur=${ms(t.db)};desc="${t.queries} ${t.queries === 1 ? "query" : "queries"}"`;
}

/**
 * A path as a route, for the log, with nothing in it that names a thing or could be a secret. API
 * paths go `/v1/<resource>/<id>/<word>/<id>`, so every id position becomes `:id`; anything else
 * with a digit in it, or as long as a key, does too (`/v1/auth/verify/<code>`, `/v1/in/<key>`).
 */
export function routeOf(path: string): string {
  return path
    .split("?")[0]!
    .split("/")
    .map((part, i) =>
      (i >= 3 && i % 2 === 1) || (i >= 2 && (/\d/.test(part) || part.length >= 16)) ? ":id" : part,
    )
    .join("/");
}
