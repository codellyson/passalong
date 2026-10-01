/**
 * What shape a hold is in, and how long ago things happened. For the Taken tab.
 *
 * `health` is derived and never stored, like `stalled` itself: a hold is waiting on a person when it
 * has an unanswered question, quiet when its lease has run out, and otherwise working. A person's
 * hold is its own thing — they hold for a week and do not report progress — so it is never measured
 * against the half hour an agent is given.
 *
 * Imports only types, so it runs under `node --test` without Nuxt.
 */
import type { Working } from "~/types/hub";

/** How long an agent may be silent before it is marked quiet. LEASE_MS in apps/api/src/claims.ts. */
export const LEASE = 30 * 60 * 1000;

export type Health = "waiting" | "quiet" | "working" | "person";

export function healthOf(w: Pick<Working, "agent" | "asking" | "state">): Health {
  if (w.agent.startsWith("person-")) return "person";
  if (w.asking) return "waiting";
  if (w.state === "stalled") return "quiet";
  return "working";
}

/** Most in need of a person first. */
export const HEALTH_ORDER: Record<Health, number> = { waiting: 0, quiet: 1, working: 2, person: 3 };

/** When the agent last said anything: its lease is renewed by every call, so it is that less a lease. */
export const heardAt = (w: Pick<Working, "agent" | "claimed_at" | "lease_until">) =>
  w.agent.startsWith("person-") ? Date.parse(w.claimed_at) : Date.parse(w.lease_until) - LEASE;

/** "just now", "12m", "3h 20m", "2d": how long, as a person says it. */
export function span(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d`;
}

export const HEALTH: Record<Health, { label: string; pill: string; dot: string; text: string }> = {
  waiting: {
    label: "Waiting on you",
    pill: "bg-warn-soft text-warn",
    dot: "bg-warn",
    text: "text-warn",
  },
  quiet: {
    label: "Went quiet",
    pill: "bg-danger-soft text-danger",
    dot: "bg-danger",
    text: "text-danger",
  },
  working: { label: "Working", pill: "bg-ok-soft text-ok", dot: "bg-ok", text: "text-ok" },
  person: {
    label: "A person",
    pill: "bg-surface text-muted",
    dot: "bg-line-strong",
    text: "text-muted",
  },
};

/** A message as one line of text: pictures and files said as what they are, whitespace collapsed. */
export const plain = (t: string) =>
  t
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")
    .replace(/\[([^\]]*)\]\([^)]*\/v1\/attachments\/[^)]*\)/g, "[file: $1]")
    .replace(/\s+/g, " ")
    .trim();
