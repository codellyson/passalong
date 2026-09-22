// The Claude Code hooks `passalong setup` installs. See docs/V2.md §11.
//
// Two moments an agent forgets what it holds: when a session starts (a restart, a /clear, a
// compaction), and when it decides it is done. SessionStart runs `passalong now --hook session`
// and puts what this worktree's agent holds into the session's context. Stop runs
// `passalong now --hook stop` and refuses, once, to end a session that still holds work nobody
// has handed in or passed — the "done!" that leaves a task to stall thirty minutes later.
//
// Pure functions here; the command in bin/passalong fetches the state and prints what these say.
// Neither hook may ever get in the way when something is wrong: offline, signed out, a server
// error — each says nothing and lets the session carry on.

/** The commands, as written into settings. Matched on when merging, so setup is idempotent. */
export const HOOK = {
  session: "passalong now --hook session",
  stop: "passalong now --hook stop",
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * What this worktree's agent holds and what is waiting, as a few lines for an agent to read.
 * Empty when there is nothing to say, so a session in an unrelated repo is not told anything.
 */
export function nowText({ held, waiting = {} }) {
  if (held) {
    const lines = [
      `Passalong: You hold ${held.id} (${held.kind || "task"}): ${held.title || held.id}.`,
    ];
    if (held.note) lines.push(`Last note: "${held.note}".`);
    if (held.state === "stalled")
      lines.push("It is marked stalled: nobody has heard from its agent in 30 minutes.");
    lines.push(
      `To carry on, call take ${held.id} (it resumes what you hold), then progress at each ` +
        "milestone. When it is done, hand_in; if it is not yours or you are stuck, pass with the reason.",
    );
    return lines.join("\n");
  }
  const parts = [];
  if (waiting.ready)
    parts.push(plural(waiting.ready, "ready task for this repo", "ready tasks for this repo"));
  if (waiting.inbox)
    parts.push(plural(waiting.inbox, "guide handed to you", "guides handed to you"));
  if (!parts.length) return "";
  return `Passalong: ${parts.join(" and ")}. Call take with no id to start the next one, when the user wants that.`;
}

/**
 * Whether a session may stop. `input` is what Claude Code sends the Stop hook on stdin. Null lets
 * it stop; an object is the hook's answer, blocking once with what to call. `stop_hook_active`
 * means this stop is already the session continuing because of this hook, and blocking again
 * would leave it no way to end.
 */
export function stopVerdict({ held, input = {} }) {
  if (!held || input.stop_hook_active) return null;
  return {
    decision: "block",
    reason:
      `You still hold ${held.id}: ${held.title || held.id}. Before ending, do one of: ` +
      `hand_in ${held.id} if it is done; pass ${held.id} with the reason if it is not yours or ` +
      `you are stuck; or, if the user is stopping mid-way, progress ${held.id} with a note ` +
      "saying what is left — then end.",
  };
}

/**
 * Settings with both hooks added, and nothing else changed. A hook already there — matched on its
 * command — is left alone, so running setup twice adds nothing. Returns a new object.
 */
export function withHooks(settings = {}) {
  const out = structuredClone(settings);
  out.hooks ??= {};
  for (const [event, command] of [
    ["SessionStart", HOOK.session],
    ["Stop", HOOK.stop],
  ]) {
    const list = (out.hooks[event] ??= []);
    const has = list.some((m) => (m.hooks || []).some((h) => h.command === command));
    if (!has) list.push({ hooks: [{ type: "command", command }] });
  }
  return out;
}
