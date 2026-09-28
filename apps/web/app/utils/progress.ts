/**
 * A guide's progress, as the things that happened to it in order.
 *
 * The guide page used to answer "where is this?" in pieces: an Answers card with the verdict, who
 * took it and who opened it, and a separate card for who holds it. Each was true and none said what
 * happened when, so a person reading it had to put the handoff's story together themselves. This
 * is that story, derived entirely from what `GET /v1/guides/:id/context` already returns — nothing
 * new is stored, so it cannot disagree with the board.
 *
 * Imports only types, so it runs under `node --test` without Nuxt.
 */
import type { GuideContext } from "~/types/hub";

export type BeatTone = "plain" | "accent" | "ok" | "danger" | "warn";

export interface Beat {
  at: string;
  who: string;
  what: string;
  /** Something said with it, in their words: a progress note, a reason for passing. */
  said?: string;
  /** Evidence that may carry screenshots, drawn by HubEvidence. */
  proof?: string;
  /**
   * Whether the proof is somebody's sentence rather than terminal output. A verdict's report is
   * prose; a hand-in's evidence is what an agent ran, and reflowing it loses the alignment.
   */
  prose?: boolean;
  tone: BeatTone;
  /** Another guide this beat is about. */
  link?: { id: string; title: string };
}

const nameOf = (by: { handle: string; name: string }) =>
  by.name?.trim() || (by.handle ? `@${by.handle}` : "someone");

export function progressOf(ctx: GuideContext): Beat[] {
  const g = ctx.guide;
  const beats: Beat[] = [];
  const to = g.to_name || (g.to ? `@${g.to}` : g.to_group_name || g.team_name || "");
  beats.push({
    at: g.created,
    who: g.mine ? "You" : g.from_name || (g.from ? `@${g.from}` : "Someone"),
    what: g.kind === "task" ? "wrote the task" : to ? `sent it to ${to}` : "published it",
    tone: "plain",
  });
  // A verdict or a browser archive writes a receipt so the inbox clears (see AGENTS.md, "Receipt is
  // not only pull"). It is not someone opening the guide, and the verdict beat already says it.
  for (const p of g.pulled_by ?? []) {
    if (p.via === "verdict" || p.via === "web") continue;
    beats.push({
      at: p.at,
      who: p.handle ? `@${p.handle}` : "Someone with the link",
      what: "opened it",
      tone: "plain",
    });
  }
  // A person's word before any work: "I'm on it", or "not me" with why. An agent holding it is
  // a claim, below; these are the people who answered in the hub or with `passalong take`.
  for (const k of ctx.acks)
    beats.push({
      at: k.at,
      who: nameOf(k.by),
      what: k.taken ? "said they're taking it" : "passed",
      said: k.taken ? undefined : k.note || undefined,
      tone: k.taken ? "accent" : "warn",
    });
  for (const k of ctx.claims) {
    const where = [k.repo || k.place, k.host].filter(Boolean).join(" on ");
    beats.push({
      at: k.claimed_at,
      who: nameOf(k.by),
      what: where ? `took it in ${where}` : "took it",
      tone: "accent",
    });
    if (k.state === "review") {
      // A person answering in the browser hands in with their verdict's proof as the evidence.
      // That is one act, so its proof is shown once, on the verdict.
      const same = ctx.verdicts.some((v) => v.by.handle === k.by.handle && v.detail === k.evidence);
      beats.push({
        at: k.updated,
        who: nameOf(k.by),
        what: "handed it in",
        // The note is dropped when the evidence already opens with it: a person answering in the
        // browser hands in with their note as the first line of the evidence.
        said: same || (k.note && k.evidence.startsWith(k.note)) ? undefined : k.note || undefined,
        proof: same ? undefined : k.evidence || undefined,
        tone: "ok",
        link: k.report ? { id: k.report.id, title: k.report.title || "The write-up" } : undefined,
      });
    } else if (k.note) {
      beats.push({
        at: k.updated,
        who: nameOf(k.by),
        what: k.state === "stalled" ? "went silent after saying" : "said",
        said: k.note,
        tone: k.state === "stalled" ? "warn" : "plain",
      });
    }
  }
  for (const v of ctx.verdicts)
    beats.push({
      at: v.at,
      who: nameOf(v.by),
      what: v.ok ? "says it works" : "says it didn't work",
      said: v.detail ? undefined : v.note || undefined,
      proof: v.detail || undefined,
      prose: true,
      tone: v.ok ? "ok" : "danger",
    });
  for (const c of ctx.children)
    beats.push({
      at: c.created,
      who: c.mine ? "You" : c.from_name || (c.from ? `@${c.from}` : "Someone"),
      what: "added a follow-up",
      link: { id: c.id, title: c.title || "Untitled guide" },
      tone: "plain",
    });
  return beats.filter((b) => b.at).sort((a, b) => a.at.localeCompare(b.at));
}

/** The dot for each tone, as utility classes. */
export const BEAT_DOT: Record<BeatTone, string> = {
  plain: "bg-line-strong",
  accent: "bg-coral",
  ok: "bg-ok",
  danger: "bg-danger",
  warn: "bg-warn",
};
