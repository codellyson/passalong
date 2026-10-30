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

const nameOf = (by: { handle: string; name: string }) =>
  by.name?.trim() || (by.handle ? `@${by.handle}` : "someone");

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
    const where = [k.repo, k.host].filter(Boolean).join(" on ");
    beats.push({
      at: k.claimed_at,
      who: nameOf(k.by),
      what: where ? `took it in ${where}` : "took it",
      tone: "held",
    });
    if (k.note)
      beats.push({
        at: k.updated,
        who: nameOf(k.by),
        what: k.state === "stalled" ? "went silent after saying" : "said",
        said: k.note,
        tone: k.state === "stalled" ? "warn" : "plain",
      });
  }
  // A hand-in ends the hold and is kept as what it was finished with. A failing one is from before
  // finishing was final, and still says so.
  for (const v of ctx.proofs)
    beats.push({
      at: v.at,
      who: nameOf(v.by),
      what: v.ok ? "finished it" : "said it didn't work",
      said: v.detail ? undefined : v.note || undefined,
      proof: v.detail || undefined,
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
