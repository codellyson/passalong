/**
 * What a guide is, as the word beside its title.
 *
 * There were two of these and they disagreed: the inbox badged `bug` and `task` and left a
 * transfer bare, on the reasoning that transfer was "the ordinary case"; Taken badged `bug` and
 * `handoff` and left a task bare. A reader moving between the two lanes saw the same guide wearing
 * a different mark, or none.
 *
 * Both were built on an assumption that is no longer true. A transfer used to be what a guide
 * became when nobody said otherwise — the parser seeded it — so badging it marked the default. It
 * is now a choice its author had to write down, like the other two, and the three ask completely
 * different things of whoever opens one: fix this here, do this work, here is what you need to
 * know. That difference is the one thing a row cannot leave to the title.
 *
 * The label is the frontmatter value, not a friendlier synonym. What you type is what you see: a
 * row that says "context" for `kind: transfer` is one more place for the two to drift.
 */
export interface KindBadge {
  label: string;
  /** Border and text colour. A badge is an outline, never a fill: it names, it does not alarm. */
  class: string;
}

const KINDS: Record<string, KindBadge> = {
  // A defect, and the only one that is about something already broken.
  bug: { label: "bug", class: "border-danger text-danger" },
  // Work nobody has done yet: the one that asks for someone's time.
  task: { label: "task", class: "border-accent text-accent" },
  // Context to carry, which asks for attention rather than action — so it is stated quietly.
  transfer: { label: "transfer", class: "border-line-strong text-muted" },
};

/** The badge for a kind, or null for a value no kind has. */
export function kindBadge(kind?: string | null): KindBadge | null {
  return KINDS[String(kind ?? "").trim()] ?? null;
}
