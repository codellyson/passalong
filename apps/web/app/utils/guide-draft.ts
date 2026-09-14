/**
 * A guide written in the browser, as the markdown the API stores.
 *
 * Until this existed, a guide could only be made by `passalong share` or an agent, so anyone
 * without a terminal could receive work and never send any. The document is the same one the CLI
 * writes — frontmatter, then the transfer sections in their usual order — so a guide written here
 * is indistinguishable from one written anywhere else, and `PUT /v1/guides/:id` takes it unchanged.
 *
 * Imports nothing, so it runs under `node --test` without Nuxt.
 */

/** The CLI's alphabet and length, so an id minted here is indistinguishable from one minted there. */
const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newId(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += ID_ALPHABET[(bytes[i] as number) % ID_ALPHABET.length];
  return out;
}

/** Frontmatter values the parser would otherwise misread — the same rule as the CLI's `quote()`. */
function quote(value: string): string {
  return /[:#[\]{}"'|>&*!%@`,]|^\s|\s$|^$/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

export interface Draft {
  title: string;
  /** A team slug, or "" to keep it to yourself. */
  team: string;
  /** A teammate's handle, or "" for the whole team. */
  to: string;
  problem: string;
  solution: string;
  steps: string;
  verification: string;
  gotchas: string;
}

export const blankDraft = (): Draft => ({
  title: "",
  team: "",
  to: "",
  problem: "",
  solution: "",
  steps: "",
  verification: "",
  gotchas: "",
});

/** The section names are the guide format's own, so an agent reading this finds what it expects. */
const SECTIONS: [keyof Draft, string][] = [
  ["problem", "Problem"],
  ["solution", "Solution shape"],
  ["steps", "Steps"],
  ["verification", "Verification"],
  ["gotchas", "Gotchas"],
];

/**
 * Where a follow-up goes by default: to the people the original is for.
 *
 * A follow-up is more context for a guide, so the people who need it are the ones working from the
 * guide. Context added to your own guide goes to whoever you sent the original to. Context added to
 * someone else's guide goes to its author, who decides whether it changes anything for the people
 * they sent it to. Either way it stays in the original's team, where the guide lists it.
 */
export function followUpDefaults(parent: {
  mine: boolean;
  team: string | null;
  from: string | null;
  to: string | null;
}): Pick<Draft, "team" | "to"> {
  const team = parent.team || "";
  if (!team) return { team, to: "" };
  return { team, to: (parent.mine ? parent.to : parent.from) || "" };
}

export function draftMarkdown(id: string, d: Draft): string {
  const front = [
    `id: ${id}`,
    `title: ${quote(d.title.trim())}`,
    "kind: transfer",
    "status: published",
  ];
  if (d.team) front.push(`team: ${d.team}`);
  if (d.team && d.to) front.push(`to: ${d.to.replace(/^@/, "")}`);
  const body = SECTIONS.map(([field, heading]) => [heading, d[field].trim()] as const)
    .filter(([, text]) => text)
    .map(([heading, text]) => `## ${heading}\n\n${text}`);
  return `---\n${front.join("\n")}\n---\n\n${body.join("\n\n")}\n`;
}
