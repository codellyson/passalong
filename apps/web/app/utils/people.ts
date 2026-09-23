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

/**
 * Two letters for an avatar: the initials of a name, or the first two letters of a single word.
 * `?` when there is nothing to take them from — an account with no name and no @name yet.
 */
export function initialsOf(label: string): string {
  const words = String(label ?? "")
    .replace(/^@/, "")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "?";
  const two = words.length > 1 ? words.map((w) => w[0]).join("") : words[0]!;
  return two.slice(0, 2).toUpperCase();
}

/**
 * A person's colour, as a hue, derived from their name so it is the same in every list and on
 * every machine — no palette to store, and no two sessions disagreeing about who is teal.
 *
 * The hash is FNV-1a, and the hue is its remainder: small, stable, and spread evenly enough that a
 * handful of teammates do not land on one colour. Lightness and chroma are the stylesheet's, so
 * both themes stay legible whatever hue comes out.
 */
export function avatarHue(seed: string): number {
  let h = 2166136261;
  for (const ch of String(seed ?? "")) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}
