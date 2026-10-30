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

/** In order. `left` is how a step is named in "what's left" on Needs you. */
export const STEPS: { id: SetupStep; name: string; left: string }[] = [
  { id: "team", name: "Your team", left: "name your team" },
  { id: "people", name: "Who's on it", left: "invite your team" },
  { id: "groups", name: "Who does what", left: "make groups" },
  { id: "projects", name: "What you work on", left: "add projects" },
  { id: "know", name: "What to know", left: "write each project's README" },
  { id: "inbox", name: "Where work comes in", left: "get your addresses" },
  { id: "agents", name: "Connect your agents", left: "connect an agent" },
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

/** The README a project with a repo starts with, so the agent asked to fill it finds the repo. */
export const repoStub = (title: string, line: string, repo: string) =>
  `# ${title}\n\n${line ? `${line}\n\n` : ""}Repo: ${repo}\n`;

/** The repo a README names on its own `Repo:` line, or "". */
export function repoOf(body: string): string {
  return body.match(/^Repo:\s*(\S+)\s*$/m)?.[1] ?? "";
}

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
