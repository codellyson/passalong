/**
 * First-run setup's pure parts (pages/hub/start.vue): the steps in order, where to resume, and the
 * README written from a person's own answers. The server remembers only which steps are done or
 * skipped (apps/api/src/setup.ts); everything a step makes goes through the routes that already
 * exist.
 *
 * Imports nothing, so it runs under `node --test` without Nuxt.
 */
export type SetupStep = "team" | "people" | "groups" | "projects" | "know" | "inbox" | "agents";
export interface SetupState {
  done: SetupStep[];
  skipped: SetupStep[];
  dismissed: boolean;
}

/** In order. */
export const STEPS: { id: SetupStep; name: string }[] = [
  { id: "team", name: "Your team" },
  { id: "people", name: "Who's on it" },
  { id: "groups", name: "Who does what" },
  { id: "projects", name: "What you work on" },
  { id: "know", name: "What to know" },
  { id: "inbox", name: "Where work comes in" },
  { id: "agents", name: "Connect your agents" },
];

export const NO_SETUP: SetupState = { done: [], skipped: [], dismissed: false };

/** Where to pick up: the first step neither done nor skipped, else the first skipped one. */
export function resumeAt(s: SetupState): SetupStep {
  const open = STEPS.find((x) => !s.done.includes(x.id) && !s.skipped.includes(x.id));
  return (open ?? STEPS.find((x) => !s.done.includes(x.id)) ?? STEPS[0]!).id;
}

/** Every step answered, done or skipped. */
export const answered = (s: SetupState) =>
  STEPS.every((x) => s.done.includes(x.id) || s.skipped.includes(x.id));

/** Steps not done yet, in order: what "Finish setting up" names. */
export const leftOf = (s: SetupState) => STEPS.filter((x) => !s.done.includes(x.id));

/**
 * A README from the three questions, in the person's own words: each answer under its heading, the
 * words one per line as a list. An answer left empty leaves its section out rather than a heading
 * over nothing.
 */
export function readmeFromAnswers(
  title: string,
  a: { what: string; who: string; words: string },
): string {
  const words = a.words
    .split("\n")
    .map((w) => w.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);
  const parts = [`# ${title}`];
  if (a.what.trim()) parts.push(a.what.trim());
  if (a.who.trim()) parts.push(`## Who uses it\n\n${a.who.trim()}`);
  if (words.length) parts.push(`## Words we use\n\n${words.map((w) => `- ${w}`).join("\n")}`);
  return `${parts.join("\n\n")}\n`;
}

/** What a person has typed for one project's README in setup, before it is saved. */
export interface KnowDraft {
  how: "questions" | "paste";
  what: string;
  who: string;
  words: string;
  pasted: string;
  /** The repo prompt was copied for their agent. */
  copied: boolean;
  /** The project has a README already, by anyone. */
  written: boolean;
}
export const newDraft = (): KnowDraft => ({
  how: "questions",
  what: "",
  who: "",
  words: "",
  pasted: "",
  copied: false,
  written: false,
});

/** Whether the way they chose holds anything to write. */
export const typed = (d: KnowDraft) =>
  d.how === "paste"
    ? Boolean(d.pasted.trim())
    : Boolean(d.what.trim() || d.who.trim() || d.words.trim());

/**
 * The README a draft writes, in the person's words; "" when there is nothing to write. "What is it?"
 * left empty opens with the line they gave the project, which is their words too.
 */
export function draftBody(title: string, d: KnowDraft, line = ""): string {
  if (!typed(d)) return "";
  if (d.how === "paste") return `${d.pasted.trim()}\n`;
  return readmeFromAnswers(title, { ...d, what: d.what.trim() || line });
}

/** Someone with no team who never started or put away setup: they set up before anything else. */
export const needsSetup = (
  me: { teams: unknown[]; setup?: SetupState } | null | undefined,
): boolean =>
  Boolean(
    me?.setup &&
      !me.teams.length &&
      !me.setup.dismissed &&
      !me.setup.done.length &&
      !me.setup.skipped.length,
  );

/**
 * A project's line colour picked as soon as it is named, and sent with it, so the mark shown while
 * typing is the one it keeps. Never coral (DESIGN.md, The Line Colour Rule).
 */
const TONES = ["amber", "green", "blue", "violet", "teal", "stone"] as const;
export function toneForName(name: string): (typeof TONES)[number] {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length]!;
}
