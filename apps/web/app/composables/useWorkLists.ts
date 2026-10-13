import type { Ref } from "vue";
import type { Guide, Task } from "~/types/hub";
import { boardStates, stateOf } from "~/utils/guide-state";

/**
 * The hub's work, sorted into the four tabs and counted. Home shows the counts and /hub/work the
 * lists; both read them from here so the numbers on the two pages cannot disagree. `q` and
 * `follows` narrow everything, as the Work page's search does; Home passes neither.
 */
export function useWorkLists(q: Ref<string>, follows: Ref<string>) {
  const { data, scope, loading, failed } = useHub();

  /** A failed work list cannot be reported as an empty queue. The shell offers Try again. */
  const unavailable = computed(
    () =>
      failed.value.guides ||
      failed.value.board ||
      failed.value.tasks ||
      failed.value.working ||
      failed.value.handedIn,
  );
  /** Wait for every list that contributes a tab count before showing any count. */
  const waiting = computed(
    () =>
      !unavailable.value &&
      (loading.value.guides ||
        loading.value.board ||
        loading.value.tasks ||
        loading.value.working ||
        loading.value.handedIn),
  );

  // An account with nothing in it is not looking at a list. It gets the steps that lead somewhere,
  // but only once both lists have arrived empty, or every first load would flash onboarding.
  const first = computed(
    () =>
      Boolean(data.value.me) &&
      !waiting.value &&
      !unavailable.value &&
      data.value.guides.length === 0 &&
      data.value.tasks.length === 0,
  );

  const terms = computed(() => q.value.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const hit = (fields: unknown[]) => {
    if (!terms.value.length) return true;
    const hay = fields.join("\n").toLowerCase();
    return terms.value.every((t) => hay.includes(t));
  };

  // ---- guides: handoffs and bugs, as the lanes always sorted them ----------------------------------

  const fromBoard = computed(() => boardStates(data.value.board));
  const me = computed(() => data.value.me?.handle || null);
  const hasTeams = computed(() => Boolean(data.value.me?.teams.length));

  /**
   * The list is scoped and the board is not. Across all teams, a guide sent to you from outside your
   * teams is on the board and not in the list — the one thing here that must not go missing.
   * Tasks are left out: they have their own sections below, from the task queue.
   */
  const guides = computed<Guide[]>(() => {
    const list = data.value.guides;
    const all =
      scope.value !== "all"
        ? list
        : [
            ...list,
            ...(data.value.board?.waiting ?? []).filter((g) => !list.some((x) => x.id === g.id)),
          ];
    return all.filter((g) => g.kind !== "task");
  });

  const matches = (g: Guide) => {
    if (follows.value && g.parent !== follows.value) return false;
    return hit([
      g.title,
      g.source_context,
      g.from,
      g.from_name,
      g.to,
      g.to_name,
      g.team_name,
      g.id,
      g.report_title,
      ...(g.tags || []),
      ...(g.stack_assumptions || []),
    ]);
  };

  const lanes = computed(() =>
    arrange(
      guides.value.filter(matches).map((g) => ({ g, state: stateOf(g, fromBoard.value, me.value) })),
    ),
  );
  const sentCount = computed(() =>
    lanes.value.sent.reduce((n, e) => n + ("row" in e ? 1 : e.group.rows.length), 0),
  );

  // ---- tasks -----------------------------------------------------------------------------------

  const taskHit = (t: Task) =>
    !follows.value && hit([t.title, t.id, t.target, t.claim?.note, t.claim?.report_title]);
  const tasks = computed(() => data.value.tasks.filter(taskHit));

  /** Yours, and waiting on you: mirrors the task groups in HubNeedsYou. */
  const taskNeedsYou = (t: Task) =>
    (t.mine || t.manage) &&
    (t.state === "review" ||
      t.state === "stalled" ||
      (t.state === "claimed" && /^BLOCKED:/i.test(t.claim?.note || "")));
  const reviewCount = computed(() => tasks.value.filter(taskNeedsYou).length);

  /** Tasks nobody is on and nobody needs to review: claimed ones are under Taken. */
  const OPEN: { state: Task["state"]; title: string; note: string; edge: string; badge: string }[] = [
    {
      state: "review",
      title: "Waiting for its author",
      note: "A teammate's task, handed in and waiting on them.",
      edge: "border-accent",
      badge: "bg-accent-soft text-accent",
    },
    {
      state: "ready",
      title: "Ready for an agent",
      note: "The next agent in the right repo takes these, oldest first.",
      edge: "border-ok",
      badge: "bg-ok-soft text-ok",
    },
    {
      state: "blocked",
      title: "Blocked",
      note: "Waiting until the tasks they depend on are approved.",
      edge: "border-warn",
      badge: "bg-warn-soft text-warn",
    },
    {
      state: "draft",
      title: "Draft",
      note: "No agent can pick these up until you mark them ready for agents.",
      edge: "border-line-strong",
      badge: "bg-surface text-muted",
    },
  ];
  const openTasks = computed(() => {
    const out = new Map<Task["state"], Task[]>();
    for (const t of tasks.value)
      if (!taskNeedsYou(t) && OPEN.some((c) => c.state === t.state))
        out.set(t.state, [...(out.get(t.state) || []), t]);
    return out;
  });
  const openTaskCount = computed(() =>
    [...openTasks.value.values()].reduce((n, l) => n + l.length, 0),
  );
  const doneTasks = computed(() => tasks.value.filter((t) => t.state === "done"));

  // ---- the counts line -------------------------------------------------------------------------

  /** Handoffs you wrote that somebody handed in, narrowed by the search like everything else. */
  const handedIn = computed(() =>
    data.value.handedIn.filter(
      (h) => !follows.value && hit([h.title, h.id, h.note, h.place, h.by.name, h.by.handle]),
    ),
  );
  const needsCount = computed(
    () => reviewCount.value + handedIn.value.length + lanes.value.needs.length,
  );
  const workingCount = computed(() => data.value.working.length);
  const openCount = computed(() => openTaskCount.value + sentCount.value);
  const doneCount = computed(() => doneTasks.value.length + lanes.value.done.length);

  return {
    unavailable,
    waiting,
    first,
    hasTeams,
    lanes,
    sentCount,
    tasks,
    OPEN,
    openTasks,
    doneTasks,
    handedIn,
    needsCount,
    workingCount,
    openCount,
    doneCount,
  };
}
