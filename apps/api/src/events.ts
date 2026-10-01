/**
 * The live event stream behind `GET /v1/events`: Server-Sent Events for one account's open hub.
 *
 * Two kinds of event, both read from rows that already exist — nothing new is stored, so the stream
 * cannot disagree with the board:
 *
 *   note     a notification addressed to this account: taken, passed, handed in, approved, works,
 *            closed, went quiet. The hub shows it as a toast. notify() already leaves out anything
 *            the account did itself.
 *   change   something happened to a guide this account can see — a hold, a progress note, a
 *            verdict, an ack. Quiet: the hub refreshes that guide and shows nothing.
 *
 * It is polled, not pushed. Each tick reads the two since a cursor, which is the time of the latest
 * row sent, and the cursor rides on each event's `id:` so a reconnect (EventSource and the hub's
 * reader both send `Last-Event-ID`) picks up where the last one left off. A time, not a row id:
 * notifications coalesce, so a repeat bumps `at` on an existing row and an id cursor would miss it.
 *
 * A connection lives a few minutes and then ends, and the client reconnects. That bounds what one
 * request can spend on reads, and a stream nobody is reading ends on its own even when the runtime
 * never reports the disconnect. Durable Objects would push instantly and poll nothing; this needs no
 * new infrastructure, and it is where to go if the per-tab reads start to matter.
 *
 * Imports no sibling, so test/events.test.mjs can drive it with fakes.
 */

export interface Note {
  id: number;
  at: string;
  [k: string]: unknown;
}
export interface Change {
  guide_id: string;
  at: string;
}

export interface Source {
  /** Notifications for the account with `at` after `since`, oldest first. */
  notes(since: string): Promise<Note[]>;
  /** Guides the account can see that changed after `since`, oldest first. */
  changes(since: string): Promise<Change[]>;
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const TICK_MS = 3000;
export const HEARTBEAT_MS = 15_000;
export const LIFETIME_MS = 4 * 60_000;

const enc = new TextEncoder();
const frame = (event: string, data: unknown, id?: string) =>
  enc.encode(`${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

/**
 * The stream for one connection, starting after `since`. `signal` ends it when the client goes;
 * `clock` is real time in the Worker and a fake in the test.
 */
export function eventStream(
  source: Source,
  since: string,
  {
    signal,
    clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) },
    tick = TICK_MS,
    heartbeat = HEARTBEAT_MS,
    lifetime = LIFETIME_MS,
  }: {
    signal?: AbortSignal;
    clock?: Clock;
    tick?: number;
    heartbeat?: number;
    lifetime?: number;
  } = {},
): ReadableStream<Uint8Array> {
  let cursor = since;
  return new ReadableStream({
    async start(out) {
      const began = clock.now();
      let spoke = began;
      // The retry the client should wait before reconnecting, and the cursor it starts from.
      out.enqueue(enc.encode(`retry: 2000\n\n`));
      out.enqueue(frame("ready", { since: cursor }, cursor));
      try {
        while (!signal?.aborted && clock.now() - began < lifetime) {
          const [notes, changes] = await Promise.all([
            source.notes(cursor),
            source.changes(cursor),
          ]);
          // One timeline, oldest first, so the cursor only ever moves forward past what was sent.
          const events = [
            ...notes.map((n) => ({ at: n.at, kind: "note" as const, data: n })),
            ...changes.map((c) => ({ at: c.at, kind: "change" as const, data: c })),
          ].sort((a, b) => a.at.localeCompare(b.at));
          for (const e of events) {
            if (e.at > cursor) cursor = e.at;
            out.enqueue(frame(e.kind, e.data, cursor));
            spoke = clock.now();
          }
          // A comment line keeps a quiet connection from being closed by anything in between.
          if (clock.now() - spoke >= heartbeat) {
            out.enqueue(enc.encode(": ping\n\n"));
            spoke = clock.now();
          }
          await clock.sleep(tick);
        }
      } catch {
        // A failed read ends this connection; the client reconnects from the last cursor it saw.
      }
      try {
        out.close();
      } catch {}
    },
  });
}

/** Where a connection starts: the client's last cursor when it is a time, else now. */
export function startAt(lastEventId: string | undefined | null, now = new Date()): string {
  const t = lastEventId ? Date.parse(lastEventId) : Number.NaN;
  return Number.isNaN(t) ? now.toISOString() : new Date(t).toISOString();
}
