/**
 * How badly a bug is broken, and which part of the product it is in, as words and colour.
 *
 * Bugs are filed by agents now, not by a form in the hub, so this is all that is left of the old
 * report utilities: what a bug row and the report page need to draw one.
 */
import { AREAS, SEVERITIES } from "#api/guide";

export const areaLabel = (slug: string) =>
  AREAS.find((a) => a.slug === slug)?.label || slug || "Other";

export const severityLabel = (slug: string) =>
  SEVERITIES.find((s) => s.slug === slug)?.label || slug;

/** Full class strings, because Tailwind scans source text and would never find `bg-${tone}-soft`. */
const SEVERITY_TONE: Record<string, string> = {
  s1: "bg-danger-soft text-danger",
  s2: "bg-warn-soft text-warn",
  s3: "bg-accent-soft text-accent",
  s4: "bg-surface text-muted",
};
export const severityTone = (slug: string) => SEVERITY_TONE[slug] || "bg-surface text-muted";
