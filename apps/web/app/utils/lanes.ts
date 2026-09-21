/**
 * The hub as three questions, in the order someone opening it asks them: what needs me, what did
 * I send and where did it get to, and what is finished.
 *
 * This replaced a board of two lanes and a list of every guide sorted by state, which between them
 * showed most guides twice and made a reader learn eight state names before the page made sense.
 * The states themselves are unchanged and still come from `guide-state.ts`; this only decides
 * which of the three sections a guide belongs in, what order they go in, and the one plain
 * sentence its row says about it.
 *
 * The sentence uses one word per act everywhere in the product: send, open, take, pass, worked,
 * didn't work, archive. "Pull" is what a terminal does; a person opens.
 *
 * Imports only types, so it runs under `node --test` without Nuxt.
 */
import type { Guide } from "~/types/hub";
import type { GuideState } from "./guide-state";

export interface LaneRow {
  g: Guide;
  state: GuideState | null;
}

/** Bugs filed together, shown as one row: eleven near-identical lines were most of the noise. */
export interface ReportGroup {
  report: string;
  title: string;
  rows: LaneRow[];
  /** The newest bug's, so a report sorts by when it last grew. */
  created: string;
}

export type SentEntry = { row: LaneRow } | { group: ReportGroup };

export type Tone = "danger" | "accent" | "ok" | "";

export function laneOf({ g, state }: LaneRow): "needs" | "sent" | "done" {
  if (g.status === "consumed") return "done";
  const key = state?.key;
  if (key === "waiting" || key === "unanswered" || key === "unjudged") return "needs";
  // Sent to you and answered, or passed on: nothing more is owed by you.
  if (!g.mine || !state) return "done";
  // Someone opened it and said it worked. That is the end of a handoff, not a stage of one.
  if (key === "landed" && g.verdict?.ok) return "done";
  return "sent";
}

const byNewest = (a: LaneRow, b: LaneRow) => b.g.created.localeCompare(a.g.created);
/** s1 is a blocker and s4 cosmetic, so the slugs compare as strings; no severity sorts last. */
const bySeverity = (a: LaneRow, b: LaneRow) =>
  (a.g.severity || "s9").localeCompare(b.g.severity || "s9");

const urgent = (e: SentEntry) =>
  "row" in e ? Boolean(e.row.state?.attention) : e.group.rows.some((r) => r.state?.attention);
const createdOf = (e: SentEntry) => ("row" in e ? e.row.g.created : e.group.created);

/**
 * Every section newest first. The one exception is in "You sent": a guide someone handed back or
 * said does not work comes first, because it is the only thing in that section you have to act on.
 */
export function arrange(rows: LaneRow[]) {
  const needs: LaneRow[] = [];
  const sentRows: LaneRow[] = [];
  const done: LaneRow[] = [];
  for (const r of rows) {
    const lane = laneOf(r);
    (lane === "needs" ? needs : lane === "sent" ? sentRows : done).push(r);
  }
  needs.sort(byNewest);
  done.sort(byNewest);

  const groups = new Map<string, ReportGroup>();
  const entries: SentEntry[] = [];
  for (const r of sentRows) {
    const id = r.g.report;
    if (!id) {
      entries.push({ row: r });
      continue;
    }
    let group = groups.get(id);
    if (!group) {
      group = { report: id, title: r.g.report_title || "", rows: [], created: r.g.created };
      groups.set(id, group);
      entries.push({ group });
    }
    group.rows.push(r);
    if (r.g.created > group.created) group.created = r.g.created;
  }
  // Inside a report the blocker leads: these were filed in one sitting, so their times say nothing.
  for (const group of groups.values())
    group.rows.sort((a, b) => bySeverity(a, b) || byNewest(a, b));

  // A report with one bug left out there is just that bug.
  const sent = entries.map((e) =>
    "group" in e && e.group.rows.length === 1 ? { row: e.group.rows[0] as LaneRow } : e,
  );
  sent.sort(
    (a, b) => Number(urgent(b)) - Number(urgent(a)) || createdOf(b).localeCompare(createdOf(a)),
  );

  return { needs, sent, done };
}

/** A person by name when the API sent one, else by handle. Anonymous only when nobody is known. */
const named = (name?: string, handle?: string | null) =>
  name || (handle ? `@${handle}` : "someone");

const list = (names: string[]) =>
  names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** The one sentence a row says about where a guide is, in words rather than a state name. */
export function statusLine({ g, state }: LaneRow): { text: string; tone: Tone } {
  // A pull with no account behind it is somebody who opened the share link without signing in;
  // that one really is anonymous.
  const openers = list(
    (g.pulled_by ?? []).map((p) => (p.handle ? `@${p.handle}` : "someone with the link")),
  );
  switch (state?.key) {
    case "unanswered":
      return { text: "waiting for your answer", tone: "" };
    case "waiting":
      return { text: "you're taking it", tone: "accent" };
    case "unjudged":
      return { text: "waiting to hear how it went", tone: "accent" };
    case "flight":
      return {
        text: openers ? `opened by ${openers}, nobody has taken it` : "not opened yet",
        tone: "",
      };
    case "taken": {
      const who = g.taken_by_names?.length
        ? g.taken_by_names
        : (g.taken_by ?? []).map((h) => `@${h}`);
      return { text: `${list(who)} ${who.length === 1 ? "is" : "are"} taking it`, tone: "" };
    }
    case "passed": {
      const d = g.declined?.[0];
      return {
        text: `${named(d?.by_name, d?.by)} passed: ${d?.note || "no reason given"}`,
        tone: "danger",
      };
    }
    case "failing":
      return g.mine
        ? {
            text: `${named(g.verdict?.by_name, g.verdict?.by)} said it didn't work: ${g.verdict?.note || "no reason given"}`,
            tone: "danger",
          }
        : { text: "you said it didn't work", tone: "danger" };
    case "landed":
      if (!g.mine) return { text: "you said it worked", tone: "ok" };
      if (g.verdict?.ok)
        return { text: `${named(g.verdict.by_name, g.verdict.by)} said it worked`, tone: "ok" };
      return {
        text: openers ? `opened by ${openers}, no answer yet` : "opened, no answer yet",
        tone: "",
      };
  }
  if (g.status === "consumed") return { text: "archived", tone: "" };
  if (!g.mine && g.my_ack && !g.my_ack.taken) {
    return { text: `you passed${g.my_ack.note ? `: ${g.my_ack.note}` : ""}`, tone: "" };
  }
  if (g.mine && !g.team) return { text: "not sent to anyone", tone: "" };
  return { text: "", tone: "" };
}
