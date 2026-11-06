// The runner: `passalong work --watch` (docs/LOOP.md §1a). Left running with a repo checked out,
// it takes work a person ticked Safe to run alone and starts Claude Code on each piece, with nobody
// watching.
//
// Each piece gets its own git worktree, on a branch of its own, so up to three agents can work at
// once without touching each other's files, and each one's change arrives as a pull request a
// person reviews. At most ten runs start in a day. A run that ends without the work done (the agent
// gave up, said it was blocked, or ran out of time) gives the work back to whoever wrote it, with
// the agent's last note, and clears its Safe to run alone tick, so it is not tried again unwatched
// until a person has looked (2026-11-06).
//
// Everything that touches git, the clock or a process is passed in, so the tests can run it.

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** How many agents at once, how many runs a day, and how long one run may take. */
export const LIMITS = { atOnce: 3, perDay: 10, minutes: 60 };

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

/** The branch a piece of work's change goes on. */
export const branchOf = (id) => `passalong/${id}`;

/**
 * Claude Code, started for one piece of work: headless, refusing anything not allowed above, and
 * with Passalong's MCP server named here, because `passalong setup` registers it for one folder and
 * a fresh worktree is another. The server runs in the worktree, so it is that worktree's agent: the
 * one that took the work. The prompt goes in on stdin.
 */
export function claudeCommand({ node = process.execPath, cli } = {}) {
  return {
    command: "claude",
    args: [
      "-p",
      "--permission-mode",
      "dontAsk",
      "--settings",
      JSON.stringify({ permissions: PERMISSIONS }),
      "--mcp-config",
      JSON.stringify({ mcpServers: { passalong: { command: node, args: [cli, "mcp"] } } }),
    ],
    stdin: true,
  };
}

/** What the agent is told: the work itself, and how to finish it as a pull request. */
export function runnerPrompt(t, branch = branchOf(t.id)) {
  return [
    `You hold passalong work ${t.id}, and no other agent can take it while you do. Here it is:`,
    "",
    String(t.markdown || "").trim(),
    "",
    `Do it in this worktree, which is on its own branch, ${branch}. Read it, work out what done`,
    `means, and get there. Call the passalong MCP tool progress with id ${t.id} and a one-line`,
    "status at each milestone; 30 minutes of silence stalls it.",
    "",
    `When it is done, commit what you changed with a message starting "${t.id}: ", then run`,
    `exactly \`git push -u origin ${branch}\` and open a pull request with`,
    `\`gh pr create --fill --head ${branch}\`. Then call hand_in with id ${t.id}, \`pr\` set to the`,
    "pull request's URL (or the commit hash if the push or the pull request failed, and say why in",
    "the note), `note`: one plain sentence saying what you did, and `evidence`: what you ran and",
    "what came back, with the commands and the lines that decided it, the test summary, the commit.",
    "Keep that as you go. What you learned about the project goes into its documents",
    "(save_document). If a call says you no longer hold it, stop.",
    "",
    "Nobody reads what you print: this session runs unattended, and anything not allowed is",
    "refused rather than asked.",
    "",
    "When a decision is the person's to make (which of two layouts, which of three fixes), ask",
    `them: call ask with id ${t.id}, one clear question, and \`choices\`: two to four options,`,
    "each with a label and a line of detail. When an option is something to look at, take a",
    "screenshot of it if you can, upload it with add_file, and give its link as that option's",
    "`picture`. Then stop. They pick one with a tap in the hub, and you are started again here to",
    "read their pick (take) and carry on.",
    "",
    "If something only a person can do stands between you and done (a permission, a secret), call",
    `progress with id ${t.id} and a note starting "BLOCKED: " that says exactly what you need,`,
    "and stop. The work goes back to the person who wrote it, with that note.",
  ].join("\n");
}

/**
 * What an agent is told when its run starts again after a person answered its question: read the
 * answer, then finish exactly as the first run was told to.
 */
export function resumePrompt(t, branch = branchOf(t.id)) {
  return [
    `You hold passalong work ${t.id} (${t.title || t.id}), and you stopped earlier to ask the person`,
    `a question. They have answered. Call the passalong MCP tool take with id ${t.id} first: their`,
    "answer comes back with it. Then carry on in this worktree, where your earlier changes are, and",
    "finish as before:",
    "",
    runnerPrompt({ ...t, markdown: "" }, branch)
      .split("\n")
      .slice(4)
      .join("\n"),
  ].join("\n");
}

/** Today, as the runner counts days: the machine's own date. */
export const dayOf = (now) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** How many runs have started today, kept in `file` beside the rest of the CLI's state. */
export function runsToday(file, day) {
  try {
    const s = JSON.parse(readFileSync(file, "utf8"));
    return s.day === day ? Number(s.runs) || 0 : 0;
  } catch {
    return 0;
  }
}

export function countRun(file, day) {
  const runs = runsToday(file, day) + 1;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ day, runs })}\n`);
  return runs;
}

/** Where the runs' worktrees and logs live: beside the checkout, never inside it. */
export const runsDirOf = (root) => join(dirname(root), `${basename(root)}.passalong-runs`);

/** Why a run gave its work back, said to whoever wrote it. */
export function passBack({ minutes, timedOut, exit, note, said, dir, branch, failed }) {
  const how = failed
    ? `couldn't start (${failed})`
    : timedOut
      ? `ran out of its ${minutes} minutes`
      : `stopped without finishing${exit === undefined || exit === null ? "" : ` (exit ${exit})`}`;
  return [
    `The runner's agent ${how}, so this is back with you and no longer marked safe to run alone.`,
    note ? `Its last note: "${note}".` : "It left no note.",
    said ? `The last thing it printed: "${said}".` : "",
    failed
      ? ""
      : `What it changed is kept on branch ${branch}, in ${dir}, on the machine that ran it.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** The last line an agent printed, from its log: often the reason it stopped. "" when none. */
export function lastLine(log) {
  try {
    const lines = readFileSync(log, "utf8").trim().split("\n");
    return (lines.at(-1) || "").trim().slice(0, 300);
  } catch {
    return "";
  }
}

/** Run a git command, quietly; its output, trimmed. Throws when git fails. */
export function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/**
 * Start an agent and wait for it, writing what it prints to `log`. Killed after `minutes`.
 * Resolves `{ exit, timedOut }`, never rejects: an agent that would not start is a run that
 * ended without the work done.
 */
export function runAgent({ command, args, stdin, prompt, cwd, log, minutes, env }) {
  return new Promise((done) => {
    const out = openSync(log, "a");
    let timedOut = false;
    let child;
    try {
      child = spawn(command, stdin ? args : [...args, prompt], {
        cwd,
        env,
        stdio: [stdin ? "pipe" : "ignore", out, out],
      });
    } catch (err) {
      return done({ exit: err.message, timedOut });
    }
    const timer = setTimeout(
      () => {
        timedOut = true;
        child.kill("SIGTERM");
      },
      minutes * 60 * 1000,
    );
    child.on("error", (err) => {
      clearTimeout(timer);
      done({ exit: err.message, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ exit: code, timedOut });
    });
    if (stdin) {
      child.stdin.on("error", () => {});
      child.stdin.end(prompt);
    }
  });
}
