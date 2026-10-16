import type { Ref } from "vue";
import type { Guide } from "~/types/hub";

/**
 * The team board: every guide in scope — tasks, handoffs and bugs — in one column each, the same
 * for everyone who opens it. The column is the server's (`stage` on every guide row); nothing here
 * re-decides it per viewer, which is what made two teammates see the same work in different places.
 * Home shows the column counts and /hub/work the board; both read them from here.
 *
 * `q` and `follows` narrow it, as the Work page's search does. `mineOnly` keeps only the cards
 * that are about you — yours, sent to you or a group you are in, held by you, or yours to review —
 * without moving any card to a different column.
 */
export const STAGES = [
  { id: "draft", label: "Draft", hint: "Not ready for anyone yet" },
  { id: "todo", label: "To do", hint: "Ready, nobody has it" },
  { id: "working", label: "In progress", hint: "Held by a person or an agent" },
  { id: "done", label: "Done", hint: "Finished, with what was shown, or archived" },
] as const;
export type Stage = (typeof STAGES)[number]["id"];

/** A card that is about you. Used as a filter only: it never moves a card. */
export const aboutMe = (g: Guide) =>
  g.mine || Boolean(g.for_me) || Boolean(g.can_review) || Boolean(g.held_by?.some((h) => h.you));

export function useWorkLists(q: Ref<string>, follows: Ref<string>, mineOnly?: Ref<boolean>) {
  const { data, scope, loading, failed } = useHub();

  /** A failed list cannot be reported as an empty board. The shell offers Try again. */
  const unavailable = computed(() => failed.value.guides || failed.value.board);
  const waiting = computed(
    () => !unavailable.value && (loading.value.guides || loading.value.board),
  );

  // An account with nothing in it is not looking at a board. It gets the steps that lead somewhere,
  // but only once the list has arrived empty, or every first load would flash onboarding.
  const first = computed(
    () =>
      Boolean(data.value.me) &&
      !waiting.value &&
      !unavailable.value &&
      data.value.guides.length === 0 &&
      data.value.tasks.length === 0,
  );
  const hasTeams = computed(() => Boolean(data.value.me?.teams.length));

  const terms = computed(() => q.value.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const hit = (fields: unknown[]) => {
    if (!terms.value.length) return true;
    const hay = fields.join("\n").toLowerCase();
    return terms.value.every((t) => hay.includes(t));
  };

  /**
   * The list is scoped and the inbox is not. Across all teams, a guide sent to you from outside your
   * teams is in the inbox and not in the list — the one thing here that must not go missing.
   */
  const guides = computed<Guide[]>(() => {
    const list = data.value.guides;
    return scope.value !== "all"
      ? list
      : [
          ...list,
          ...(data.value.board?.waiting ?? []).filter((g) => !list.some((x) => x.id === g.id)),
        ];
  });

  const matches = (g: Guide) => {
    if (follows.value && g.parent !== follows.value) return false;
    if (mineOnly?.value && !aboutMe(g)) return false;
    return hit([
      g.title,
      g.summary,
      g.source_context,
      g.from,
      g.from_name,
      g.to,
      g.to_name,
      g.to_group,
      g.team_name,
      g.id,
      g.report_title,
      ...(g.held_by ?? []).flatMap((h) => [h.name, h.agent]),
      ...(g.tags || []),
      ...(g.stack_assumptions || []),
    ]);
  };

  const columns = computed(() => {
    const shown = guides.value.filter(matches);
    return STAGES.map((s) => ({
      ...s,
      cards: shown.filter((g) => (g.stage ?? "todo") === s.id),
    }));
  });

  return { unavailable, waiting, first, hasTeams, columns };
}
