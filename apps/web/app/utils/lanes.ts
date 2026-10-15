/**
 * The one plain sentence a guide's row says about where it is, and whether its author may close it.
 * The states themselves come from `guide-state.ts`. (Which column a guide is in on the team board
 * is the server's `stage`, not decided here.)
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

export type Tone = "danger" | "accent" | "ok" | "";

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
  // Given to someone else: say who has it, rather than asking you anything.
  if (!g.mine && !state && g.to && !g.for_me)
    return { text: `given to ${named(g.to_name, g.to)}`, tone: "" };
  // A team's guide a teammate handled: say who, rather than asking you anything.
  if (!g.mine && !state) {
    if (g.verdict && g.verdict.by)
      return {
        text: `${named(g.verdict.by_name, g.verdict.by)} said it ${g.verdict.ok ? "worked" : "didn't work"}`,
        tone: g.verdict.ok ? "ok" : "danger",
      };
    const who = g.taken_by_names?.length
      ? g.taken_by_names
      : (g.taken_by ?? []).map((h) => `@${h}`);
    if (who.length)
      return { text: `${list(who)} ${who.length === 1 ? "is" : "are"} taking it`, tone: "" };
  }
  if (g.status === "consumed")
    return {
      text: g.outcome === "archived" || !g.outcome ? "archived" : "finished",
      tone: "",
    };
  if (!g.mine && g.my_ack && !g.my_ack.taken) {
    return { text: `you passed${g.my_ack.note ? `: ${g.my_ack.note}` : ""}`, tone: "" };
  }
  if (g.mine && !g.team) return { text: "not sent to anyone", tone: "" };
  return { text: "", tone: "" };
}

/**
 * Whether you can take this off the board yourself.
 *
 * Its author or a team admin closes a guide, and one already closed has nowhere to go. Three surfaces ask the same
 * question: a row in the hub, a bundled report's group, and the report page. It was written out
 * three times, and a report of eleven bugs had no close at all for as long as it took to notice
 * that two of the three had never had it.
 */
export function closable(g: { mine: boolean; manage?: boolean; status: string }) {
  return (g.mine || Boolean(g.manage)) && g.status !== "consumed";
}
