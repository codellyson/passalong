/**
 * Work events for apps: what a team's app channel is sent each time a piece of its work moves.
 *
 * Thin on purpose. The body names the event, the work and its status, and nothing a person wrote:
 * no title, no note, no share link. A receiver that wants more reads `GET /v1/work/:id` with its
 * own token, so what it shows is always what Passalong says now, and a leaked payload says little.
 *
 * Signed like Stripe's: `Passalong-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`
 * with the channel's secret. Verify by recomputing, and refuse a `t` more than five minutes old.
 *
 * Imports no sibling, so test/work-events.test.mjs can drive it.
 */

export type WorkEvent =
  | "taken"
  | "progress"
  | "asked"
  | "handed_in"
  | "passed"
  | "released"
  | "replied"
  | "done"
  | "reopened"
  | "status";

/** The last segment of a write under /v1/work/:id/ or /v1/tasks/:id/, as the event it is. */
const BY_ACT: Record<string, WorkEvent> = {
  "person-take": "taken",
  progress: "progress",
  "person-progress": "progress",
  ask: "asked",
  hand_in: "handed_in",
  "person-hand_in": "handed_in",
  pass: "passed",
  release: "released",
  reply: "replied",
  finish: "done",
  reopen: "reopened",
  status: "status",
};

/**
 * Which event a successful write was, or null for one apps are not told about (sharing, assigning,
 * attaching a file). Takes the request path and method; `/v1/take` and `/v1/tasks/next` name no
 * work in the path, so they are `taken` and the caller finds the id in the answer.
 */
export function eventFor(method: string, path: string): WorkEvent | null {
  if (method === "GET") return null;
  if (path === "/v1/take" || path === "/v1/tasks/next") return "taken";
  const m = /^\/v1\/(?:work|tasks)\/[^/]+\/([^/]+)$/.exec(path);
  return (m && BY_ACT[m[1] ?? ""]) || null;
}

/** The two takes whose path names no work: the id is in the answer, as `work` or `task`. */
export function takesNext(method: string, path: string): boolean {
  return method === "POST" && (path === "/v1/take" || path === "/v1/tasks/next");
}

export interface EventFacts {
  event: WorkEvent | "test";
  work: string;
  status: string;
  team: string;
  url: string;
  at: string;
}

/** The JSON an app channel is sent. Fixed key order, so the signed bytes are predictable. */
export function eventBody(f: EventFacts): string {
  return JSON.stringify({
    event: f.event,
    work: f.work,
    status: f.status,
    team: f.team,
    url: f.url,
    at: f.at,
  });
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The `Passalong-Signature` header value for `body`, signed at `t` (unix seconds). */
export async function signature(secret: string, t: number, body: string): Promise<string> {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${body}`)}`;
}

/** What a receiver does: true when `header` signs `body` with `secret` and is under `maxAge` old. */
export async function verify(
  secret: string,
  header: string,
  body: string,
  nowSeconds: number,
  maxAge = 300,
): Promise<boolean> {
  const t = Number(/(?:^|,)t=(\d+)/.exec(header)?.[1]);
  const v1 = /(?:^|,)v1=([0-9a-f]{64})/.exec(header)?.[1];
  if (!t || !v1 || Math.abs(nowSeconds - t) > maxAge) return false;
  const want = await hmacHex(secret, `${t}.${body}`);
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
