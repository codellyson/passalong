/**
 * A piece of work's progress, as the things that happened to it in order.
 *
 * Derived entirely from what `GET /v1/work/:id/context` already returns — nothing new is stored,
 * so it cannot disagree with the board. Who wrote it and who it went to, who opened it, who took it
 * and what they last said, what it was finished with, and the work that came out of it.
 *
 * Imports only types, so it runs under `node --test` without Nuxt.
 */
import type { WorkContext } from "~/types/hub";

export type BeatTone = "plain" | "held" | "ok" | "danger" | "warn";

export interface Beat {
  at: string;
  who: string;
  what: string;
  /** Something said with it, in their words: a progress note. */
  said?: string;
  /** What it was finished with, which may carry screenshots, drawn by HubEvidence. */
  proof?: string;
  tone: BeatTone;
  /** Other work this beat is about. */
  link?: { id: string; title: string };
}

// It begins the line it is in, so it is capitalised.
const nameOf = (by: { handle: string; name: string }) =>
  by.name?.trim() || (by.handle ? `@${by.handle}` : "Someone");

/**
 * Who did it, in the words a person reads. An agent works as its person's account, so what it did
 * is said as "Your agent" or "Ada's agent", never as "You" over words the agent wrote (2026-11-07).
 */
export const actorOf = (o: {
  by: { handle: string; name: string };
  mine?: boolean;
  agent?: boolean;
}): string =>
  o.agent ? (o.mine ? "Your agent" : `${nameOf(o.by)}'s agent`) : o.mine ? "You" : nameOf(o.by);

/** A hold taken in the browser is a person's; any other is an agent's (claims.ts `person-`). */
const heldByAgent = (k: { agent?: string }) => Boolean(k.agent) && !k.agent?.startsWith("person-");

export function progressOf(ctx: WorkContext): Beat[] {
  const g = ctx.work;
  const beats: Beat[] = [];
  const to = g.to_name || (g.to ? `@${g.to}` : g.to_group_name || g.team_name || "");
  beats.push({
    at: g.created,
    who: g.mine ? "You" : g.from_name || (g.from ? `@${g.from}` : "Someone"),
    what: to ? `sent it to ${to}` : "wrote it",
    tone: "plain",
  });
  // A browser archive writes a receipt so the inbox clears; that is not someone opening it.
  for (const p of g.pulled_by ?? []) {
    if (p.via === "web") continue;
    beats.push({
      at: p.at,
      who: p.handle ? `@${p.handle}` : "Someone with the link",
      what: "opened it",
      tone: "plain",
    });
  }
  for (const k of ctx.claims) {
    // Where it runs (a repo, a machine) is the agent's business, not the reader's.
    const who = actorOf({ by: k.by, mine: k.mine, agent: heldByAgent(k) });
    beats.push({
      at: k.claimed_at,
      who,
      what: "took it",
      tone: "held",
    });
    // What it says as it goes is in the conversation beside this; here only going quiet is news.
    if (k.note && k.state === "stalled")
      beats.push({
        at: k.updated,
        who,
        what: "went silent after saying",
        said: k.note,
        tone: "warn",
      });
  }
  // A hand-in ends the hold and is kept as what it was finished with. A failing one is from before
  // finishing was final, and still says so.
  // What it was finished with, and the line said with it, are shown once, in their own section on
  // the page; here it is the moment. A hand-in that did not work has no such section, so what it
  // said and showed stay here.
  for (const v of ctx.proofs)
    beats.push({
      at: v.at,
      who: actorOf(v),
      what: v.ok ? "finished it" : "said it didn't work",
      said: v.ok || v.detail ? undefined : v.note || undefined,
      proof: v.ok ? undefined : v.detail || undefined,
      tone: v.ok ? "ok" : "danger",
    });
  for (const c of ctx.children)
    beats.push({
      at: c.created,
      who: c.mine ? "You" : c.from_name || (c.from ? `@${c.from}` : "Someone"),
      what: "made more work from it",
      link: { id: c.id, title: c.title || "Untitled" },
      tone: "plain",
    });
  return beats.filter((b) => b.at).sort((a, b) => a.at.localeCompare(b.at));
}

/** The dot for each tone, as utility classes. */
export const BEAT_DOT: Record<BeatTone, string> = {
  plain: "bg-line-strong",
  held: "bg-fg",
  ok: "bg-ok",
  danger: "bg-danger",
  warn: "bg-warn",
};
