/**
 * What the runner (`passalong work --watch`) tells its agent, what that agent may run, and how to
 * tell that Claude's usage ran out: sent with each piece of work the runner takes (POST
 * /v1/tasks/next with `alone`).
 *
 * These lived in the CLI (packages/passalong/src/runner.js), so every change to a sentence the
 * agent reads, or to a command it may run, was an npm release and another approval with 2FA. Here
 * they change with a deploy (2026-11-06). The CLI keeps its own copy for a server that sends none.
 *
 * `{branch}` in the text is the branch the run is on, which only the runner knows: it can be a
 * fresh one beside an earlier run's. The runner fills it in.
 *
 * This file imports nothing, so a test can import it.
 */

/**
 * What an unattended agent may do. `dontAsk` refuses anything not listed here, since there is
 * nobody to ask: read and edit files in its worktree, use Passalong, run the usual build and test
 * tools, commit, push its own branch and open a pull request. Never push anywhere else, force a
 * push, or throw work away.
 */
export const PERMISSIONS = {
  allow: [
    "Read",
    "Edit",
    "Write",
    "Glob",
    "Grep",
    "mcp__passalong",
    "Bash(git status*)",
    "Bash(git diff*)",
    "Bash(git log*)",
    "Bash(git show*)",
    "Bash(git add *)",
    "Bash(git commit *)",
    "Bash(git push -u origin passalong/*)",
    "Bash(gh pr create *)",
    "Bash(gh pr view *)",
    "Bash(npm *)",
    "Bash(pnpm *)",
    "Bash(yarn *)",
    "Bash(npx *)",
    "Bash(node *)",
    "Bash(make *)",
    "Bash(python *)",
    "Bash(python3 *)",
    "Bash(pytest *)",
    "Bash(go *)",
    "Bash(cargo *)",
  ],
  deny: [
    "Bash(git push --force*)",
    "Bash(git push -f*)",
    "Bash(git push * --force*)",
    "Bash(git reset --hard*)",
    "Bash(rm -rf *)",
  ],
};

/**
 * Claude Code's ways of saying its usage ran out, as one case-insensitive pattern. Only its own
 * phrasings: an agent that added "a daily limit" to someone's app must not pause the runner.
 */
export const USAGE_OUT =
  "usage limit reached|hit your (usage |session |weekly )?limit|(session|weekly|5-hour|five-hour|opus|sonnet) limit reached|out of (extra )?usage|rate_limit_error|credit balance is too low";

export type Forge = "github" | "gitlab";

/** How a run ends: committed, pushed, a pull request (or GitLab's merge request), then hand_in. */
function ship(id: string, forge: Forge): string[] {
  return forge === "gitlab"
    ? [
        `When it is done, commit what you changed with a message starting "${id}: ", then run`,
        "exactly `git push -u origin {branch} -o merge_request.create`, which opens a merge",
        `request and prints its link. Then call hand_in with id ${id}, \`pr\` set to that link (or`,
        "the commit hash if the push failed, and say why in the note), `note`: one plain",
      ]
    : [
        `When it is done, commit what you changed with a message starting "${id}: ", then run`,
        "exactly `git push -u origin {branch}` and open a pull request with",
        `\`gh pr create --fill --head {branch}\`. Then call hand_in with id ${id}, \`pr\` set to the`,
        "pull request's URL (or the commit hash if the push or the pull request failed, and say why",
        "in the note), `note`: one plain",
      ];
}

/** How to work and finish, the same whether the run is new or carrying on. */
function howTo(id: string, forge: Forge): string[] {
  return [
    "Do it in this worktree, which is on its own branch, {branch}. Read it, work out what done",
    `means, and get there. Call the passalong MCP tool progress with id ${id} and a one-line`,
    "status at each milestone; 30 minutes of silence stalls it.",
    "",
    ...ship(id, forge),
    "sentence saying what you did, and `checks`: one per thing the work asked for, each with",
    "`says` (what happened, in one plain sentence for a person) and `cmd` (the command that proves",
    "it: a test, a type check, a build, a request to the app; never a search of the code). A",
    "person reviews what you hand in: they approve it, or send it back with what to change. What",
    "you learned about the project goes into its documents (save_document). If a call says you no",
    "longer hold it, stop.",
    "",
    "Nobody reads what you print: this session runs unattended, and anything not allowed is",
    "refused rather than asked.",
    "",
    "When a decision is the person's to make (which of two layouts, which of three fixes), ask",
    `them: call ask with id ${id}, one clear question, and \`choices\`: two to four options,`,
    "each with a label and a line of detail. When an option is something to look at, take a",
    "screenshot of it if you can, upload it with add_file, and give its link as that option's",
    "`picture`. Then stop. They pick one with a tap in the hub, and you are started again here to",
    "read their pick (take) and carry on.",
    "",
    "If something only a person can do stands between you and done (a permission, a secret), call",
    `progress with id ${id} and a note starting "BLOCKED: " that says exactly what you need,`,
    "and stop. The work goes back to the person who wrote it, with that note.",
    "",
    "Never call pass yourself. If you stop without hand_in, the runner gives the work back",
    "unfinished and shows your last message as the reason, so end with what is done and what",
    "isn't, in plain sentences.",
  ];
}

export interface Brief {
  /** A new run: the work itself, then how to do and finish it. */
  start: string;
  /** Started again after a person answered its question. */
  resume: string;
  /** Started again after it stopped part-way: usage ran out, or the runner was stopped. */
  paused: string;
  permissions: typeof PERMISSIONS;
  /** USAGE_OUT, for the runner to read its agent's output with. */
  usage: string;
}

/** Everything the runner needs to tell its agent about one piece of work. */
export function brief(
  t: { id: string; title?: string; markdown?: string },
  forge: Forge = "github",
): Brief {
  const id = t.id;
  const title = t.title || id;
  const rest = howTo(id, forge);
  return {
    start: [
      `You hold passalong work ${id}, and no other agent can take it while you do. Here it is:`,
      "",
      String(t.markdown || "").trim(),
      "",
      `First call the passalong MCP tool take with id ${id}: it hands you any notes a person left.`,
      "If this branch already has commits, an earlier run was sent back from review, and those",
      "notes say what to change: start from what is there and change that, rather than starting",
      "over.",
      "",
      ...rest,
    ].join("\n"),
    resume: [
      `You hold passalong work ${id} (${title}), and you stopped earlier to ask the person a`,
      `question. They have answered. Call the passalong MCP tool take with id ${id} first: their`,
      "answer comes back with it. Then carry on in this worktree, where your earlier changes are,",
      "and finish as before:",
      "",
      ...rest,
    ].join("\n"),
    paused: [
      `You hold passalong work ${id} (${title}). An earlier run on it stopped before it finished,`,
      "because Claude's usage ran out or the runner was stopped. Call the passalong MCP tool take",
      `with id ${id} first to read the work again. Then look at what is already done in this`,
      "worktree (git status, git log), carry on from there, and finish as before:",
      "",
      ...rest,
    ].join("\n"),
    permissions: PERMISSIONS,
    usage: USAGE_OUT,
  };
}
