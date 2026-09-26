// PROTOTYPE — hub guide page variants. Delete with the prototype.
//
// The life of one guide as events in time, and where it sits on its journey, both derived from
// what GET /v1/guides/:id/context already returns. Nothing new is fetched.
import type { GuideContext } from "~/types/hub";

export interface Beat {
  at: string;
  who: string;
  what: string;
  /** A longer thing said with it: a progress note, a verdict's report, a reason for passing. */
  said?: string;
  /** Evidence text that may carry screenshots, for HubEvidence. */
  proof?: string;
  tone: "plain" | "accent" | "ok" | "danger" | "warn";
  /** Another guide this beat is about, to link to. */
  link?: { id: string; title: string };
}

const nameOf = (by: { handle: string; name: string }) =>
  by.name?.trim() || (by.handle ? `@${by.handle}` : "someone");

export function story(ctx: GuideContext): Beat[] {
  const g = ctx.guide;
  const beats: Beat[] = [];
  const to = g.to_name || (g.to ? `@${g.to}` : g.to_group_name || g.team_name || "");
  beats.push({
    at: g.created,
    who: g.mine ? "You" : g.from_name || `@${g.from}`,
    what: g.kind === "task" ? "wrote the task" : to ? `sent it to ${to}` : "published it",
    tone: "plain",
  });
  for (const p of g.pulled_by ?? [])
    beats.push({
      at: p.at,
      who: p.handle ? `@${p.handle}` : "Someone with the link",
      what: "opened it",
      tone: "plain",
    });
  for (const d of g.declined ?? [])
    beats.push({
      at: d.at,
      who: d.by_name || `@${d.by}`,
      what: "passed",
      said: d.note,
      tone: "warn",
    });
  for (const k of ctx.claims) {
    const where = [k.repo || k.place, k.host].filter(Boolean).join(" on ");
    beats.push({
      at: k.claimed_at,
      who: nameOf(k.by),
      what: where ? `took it in ${where}` : "took it",
      tone: "accent",
    });
    // A person answering in the browser hands in with their verdict's own proof as the evidence;
    // that is one act, so the proof is shown once, on the verdict.
    const same = ctx.verdicts.some((v) => v.by.handle === k.by.handle && v.detail === k.evidence);
    if (k.state === "review" && same)
      beats.push({ at: k.updated, who: nameOf(k.by), what: "handed it in", tone: "ok" });
    else if (k.state === "review")
      beats.push({
        at: k.updated,
        who: nameOf(k.by),
        what: "handed it in",
        said: k.note,
        proof: k.evidence,
        tone: "ok",
        link: k.report ? { id: k.report.id, title: k.report.title } : undefined,
      });
    else if (k.note)
      beats.push({
        at: k.updated,
        who: nameOf(k.by),
        what: k.state === "stalled" ? "went quiet after" : "said",
        said: k.note,
        tone: k.state === "stalled" ? "warn" : "plain",
      });
  }
  for (const v of ctx.verdicts)
    beats.push({
      at: v.at,
      who: nameOf(v.by),
      what: v.ok ? "says it works" : "says it didn't work",
      said: v.detail ? undefined : v.note,
      proof: v.detail || undefined,
      tone: v.ok ? "ok" : "danger",
    });
  for (const c of ctx.children)
    beats.push({
      at: c.created,
      who: c.from_name || `@${c.from}`,
      what: "added a follow-up",
      link: { id: c.id, title: c.title || "Untitled" },
      tone: "plain",
    });
  return beats.filter((b) => b.at).sort((a, b) => a.at.localeCompare(b.at));
}

export interface Stop {
  label: string;
  state: "done" | "now" | "next";
}

/** The journey a guide of this kind takes, and how far along it this one is. */
export function journey(ctx: GuideContext): Stop[] {
  const g = ctx.guide;
  const labels =
    g.kind === "task"
      ? ["Written", "Ready", "Taken", "Handed in", "Approved"]
      : ["Sent", "Opened", "Taken", "Handed in", "Closed"];
  let at = 0;
  if (g.kind === "task" ? g.status !== "draft" : true) at = 1;
  if (g.kind !== "task" && !(g.pulled_by?.length || g.pulls)) at = 0;
  if (ctx.claims.length || g.taken_by?.length) at = 2;
  if (ctx.claims.some((k) => k.state === "review") || ctx.verdicts.length) at = 3;
  if (g.status === "consumed") at = 4;
  return labels.map((label, i) => ({ label, state: i < at ? "done" : i === at ? "now" : "next" }));
}

export const TONE: Record<Beat["tone"], string> = {
  plain: "bg-line-strong",
  accent: "bg-coral",
  ok: "bg-ok",
  danger: "bg-danger",
  warn: "bg-warn",
};
