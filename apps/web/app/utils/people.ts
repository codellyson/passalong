/**
 * People and teams as a person reads them.
 *
 * The API sends `from_name`, `to_name`, `team_name` and friends already worked out, with one rule:
 * someone's name, else their @handle, else their @account id. It never says "someone" about a real
 * account. These helpers apply the same rule on this side, for the fields that arrive without a
 * name and for anything cached from before the API carried one.
 *
 * Imports only types, so it runs under `node --test` without Nuxt.
 */
import type { Guide, Me, Team } from "~/types/hub";

export function personName(
  name?: string | null,
  handle?: string | null,
  id?: string | null,
): string {
  return name?.trim() || (handle ? `@${handle}` : id ? `@${id}` : "");
}

export const fromName = (g: Guide) => g.from_name || personName(null, g.from);
export const toName = (g: Guide) => g.to_name || personName(null, g.to);

/** A team by the name it was given, not the slug it was stored under. */
export function teamLabel(g: Pick<Guide, "team" | "team_name">, teams: Team[] = []): string {
  return g.team_name || teams.find((t) => t.slug === g.team)?.name || g.team || "";
}

export const meName = (me: Me | null) =>
  me ? me.display || personName(me.name, me.handle, me.account) : "";

/**
 * The @name suggested from a name someone typed: "Ada Okafor" → "ada-okafor".
 *
 * The server's rule is 2–31 letters, digits and dashes, starting with a letter or digit. Asking a
 * newcomer to invent a string in that format was the step people got stuck on, so it is offered
 * instead and only edited by whoever wants to.
 */
export function handleFrom(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 31)
    .replace(/-+$/g, "");
}
