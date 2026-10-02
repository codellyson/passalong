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
      // `kind` is required on what /v1/working sends. The `|| "task"` that used to be here was
      // both dead and wrong — absent has meant transfer since kinds existed, never task.
      `Passalong: You hold ${held.id} (${held.kind}): ${held.title || held.id}.`,
    ];
    if (held.note) lines.push(`Last note: "${held.note}".`);
    // The one thing here that is new information rather than a reminder: the person has written, and
    // nothing else in the session will say so until the agent next checks in.
    if (held.replies)
      lines.push(
        `${plural(held.replies, "message", "messages")} from the person ${held.replies === 1 ? "is" : "are"} ` +
          `waiting for you: call take ${held.id} to read ${held.replies === 1 ? "it" : "them"} before anything else.`,
      );
    if (held.state === "stalled")
      lines.push("It is marked stalled: nobody has heard from its agent in 30 minutes.");
    lines.push(
      `To carry on, call take ${held.id} (it resumes what you hold), then progress at each ` +
        "milestone. When it is done, hand_in with evidence — what you ran and what came back — " +
        "so keep it as you go; if it is not yours or you are stuck, pass with the reason.",
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
  // An agent that asked a question was told to stop and wait, so it must be let: blocking it would
  // make the instruction and the hook contradict each other, and the agent would pick one.
  if (!held || held.asking || input.stop_hook_active) return null;
  return {
    decision: "block",
    reason:
      `You still hold ${held.id}: ${held.title || held.id}. Before ending, do one of: ` +
      `hand_in ${held.id} with your evidence if it is done; pass ${held.id} with the reason if ` +
      `it is not yours or you are stuck; or, if the user is stopping mid-way, progress ${held.id} ` +
      "with a note saying what is left — then end.",
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

// ---- the status line -------------------------------------------------------------------------------
//
// Claude Code draws a status line from a command's output, under the prompt, all session long. It is
// the one place a person sees what their agent holds without asking. The command is
// `passalong now --statusline`, which prints from a local cache and refreshes it in the background:
// Claude Code cancels a status line that is still running when the next update arrives, so a
// network call in the foreground would leave the line blank.

/** The status line command, as written into settings. */
export const STATUS_LINE = "passalong now --statusline";

/** Keep a one-line note to what fits beside everything else in a terminal footer. */
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * One line: what this worktree's agent holds, then what needs you and what is ready here.
 * `needs` counts everything waiting on the person: work handed in for review, agents stuck on
 * them, and guides handed to them.
 */
export function statusText({ held, needs = 0, ready = 0 }) {
  const parts = [];
  if (held) {
    const said = held.note ? ` "${clip(held.note, 32)}"` : "";
    parts.push(`▸ ${held.id}${held.state === "stalled" ? " (stalled)" : ""}${said}`);
  } else parts.push("passalong");
  if (needs) parts.push(`${needs} need${needs === 1 ? "s" : ""} you`);
  if (ready) parts.push(`${ready} ready`);
  if (parts.length === 1 && !held) parts.push("clear");
  return parts.join(" · ");
}

/**
 * Settings with the status line added, when there is none. A status line someone already has is
 * theirs — a script with their git branch or their context meter — and setup never replaces it.
 * `refreshInterval` keeps it current while the session sits idle.
 */
export function withStatusLine(settings = {}) {
  if (settings.statusLine) return settings;
  return {
    ...structuredClone(settings),
    statusLine: { type: "command", command: STATUS_LINE, refreshInterval: 30 },
  };
}
