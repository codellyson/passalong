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
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { hostname, platform } from "node:os";
import { basename, dirname, join, relative } from "node:path";

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
      // One JSON event per line as it works, which the runner turns into the steps a person can
      // watch from the hub (describe below). Plain -p prints only the final answer, at the end.
      "--output-format",
      "stream-json",
      "--verbose",
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
 * Start an agent and wait for it. What it prints is read a line at a time: each becomes a line of
 * `log` a person can read (Claude Code's JSON events made into sentences, anything else as it came),
 * and each thing it does is handed to `onStep`. Killed after `minutes`. Resolves
 * `{ exit, timedOut }`, never rejects: an agent that would not start is a run that ended without
 * the work done.
 */
export function runAgent({
  command,
  args,
  stdin,
  prompt,
  cwd,
  log,
  minutes,
  env,
  onStep = () => {},
}) {
  return new Promise((done) => {
    let timedOut = false;
    let child;
    const write = (text) => {
      try {
        appendFileSync(log, `${clock()} ${text}\n`);
      } catch {}
    };
    try {
      child = spawn(command, stdin ? args : [...args, prompt], {
        cwd,
        env,
        stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"],
      });
    } catch (err) {
      write(`couldn't start: ${err.message}`);
      return done({ exit: err.message, timedOut });
    }
    const reader = () => {
      let rest = "";
      return (chunk) => {
        rest += chunk;
        const lines = rest.split("\n");
        rest = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const d = describe(line, cwd);
          if (d.log) write(d.log);
          for (const step of d.step ? d.step.split("\n") : []) onStep(step);
        }
      };
    };
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", reader());
    child.stderr?.on("data", reader());
    const timer = setTimeout(
      () => {
        timedOut = true;
        child.kill("SIGTERM");
      },
      minutes * 60 * 1000,
    );
    child.on("error", (err) => {
      clearTimeout(timer);
      write(`couldn't start: ${err.message}`);
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

const clock = () => new Date().toTimeString().slice(0, 8);

/**
 * Take out what looks like a secret before a line leaves the machine: a long run of letters and
 * digits (a token, a key) and the value after token=, secret=, password= or key=. Steps are read by
 * the team in the hub, and an agent's commands can carry what its environment holds.
 */
export function hideSecrets(text) {
  return String(text)
    .replace(/\b((?:[a-z_]*_)?(?:token|secret|password|passwd|api_?key|key))=\S+/gi, "$1=[hidden]")
    .replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g, "[hidden]");
}

const one = (s, max = 140) => {
  const line =
    String(s ?? "")
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** What one tool call does, in words: "Editing src/deals/form.tsx", "Running `npm test`". */
export function toolStep(name, input = {}, cwd = "") {
  const path = (p) => {
    if (!p) return "a file";
    const r = cwd ? relative(cwd, String(p)) : String(p);
    return r && !r.startsWith("..") ? r : String(p);
  };
  const said = {
    Read: () => `Reading ${path(input.file_path)}`,
    Edit: () => `Editing ${path(input.file_path)}`,
    MultiEdit: () => `Editing ${path(input.file_path)}`,
    Write: () => `Writing ${path(input.file_path)}`,
    NotebookEdit: () => `Editing ${path(input.notebook_path)}`,
    Bash: () => `Running \`${one(input.command, 120)}\``,
    Grep: () => `Searching for "${one(input.pattern, 80)}"`,
    Glob: () => `Looking for files: ${one(input.pattern, 80)}`,
    WebFetch: () => `Reading ${one(input.url, 120)}`,
    WebSearch: () => `Searching the web for "${one(input.query, 80)}"`,
    TodoWrite: () => {
      const now = (input.todos || []).find((t) => t.status === "in_progress");
      return now ? `Next: ${one(now.activeForm || now.content)}` : "Planning the steps";
    },
    Task: () => `Starting a helper: ${one(input.description, 80)}`,
    Agent: () => `Starting a helper: ${one(input.description, 80)}`,
    mcp__passalong__progress: () => `Progress: ${one(input.note)}`,
    mcp__passalong__hand_in: () => `Handing it in${input.pr ? `: ${one(input.pr)}` : ""}`,
    mcp__passalong__ask: () => `Asking you: ${one(input.question)}`,
    mcp__passalong__take: () => "Reading the work again",
    mcp__passalong__save_document: () =>
      `Writing down what it learned: ${one(input.title || input.path)}`,
  }[name];
  if (said) return said();
  const short = String(name).replace(/^mcp__([^_]+)__/, "$1: ");
  return `Using ${short}`;
}

/**
 * One line the agent printed, as a line of the log and, when it did something, a step.
 *
 * Claude Code's stream-json events become sentences: what it says (its first line), each tool it
 * calls, a tool that failed, and the result at the end. Anything that is not one of those events
 * (another agent, a crash) is kept as it came, and is a step too: it may be the only sign of why a
 * run stopped.
 */
export function describe(line, cwd = "") {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    const text = hideSecrets(one(line, 300));
    return { log: text, step: text };
  }
  if (!e || typeof e !== "object") return { log: hideSecrets(one(line, 300)), step: "" };
  if (e.type === "system" && e.subtype === "init")
    return { log: `started${e.model ? ` (${e.model})` : ""}`, step: "" };
  if (e.type === "assistant") {
    const logs = [];
    const steps = [];
    for (const c of e.message?.content ?? []) {
      if (c.type === "text" && c.text?.trim()) {
        logs.push(hideSecrets(c.text.trim()));
        steps.push(hideSecrets(one(c.text)));
      } else if (c.type === "tool_use") {
        const s = hideSecrets(toolStep(c.name, c.input, cwd));
        logs.push(s);
        steps.push(s);
      }
    }
    return { log: logs.join("\n"), step: steps.join("\n") };
  }
  if (e.type === "user") {
    const failed = (e.message?.content ?? []).find((c) => c.type === "tool_result" && c.is_error);
    if (!failed) return { log: "", step: "" };
    const why = Array.isArray(failed.content)
      ? failed.content.map((x) => x.text || "").join(" ")
      : failed.content;
    const text = hideSecrets(`That didn't work: ${one(why)}`);
    return { log: text, step: text };
  }
  if (e.type === "result") {
    const how = e.is_error ? "Stopped with an error" : "Finished";
    const text = hideSecrets(`${how}${e.result ? `: ${one(e.result, 200)}` : ""}`);
    return { log: text, step: text };
  }
  return { log: "", step: "" };
}

/**
 * The git checkouts a runner started in `cwd` serves: `cwd`'s own when it is inside one, else every
 * checkout in the folders under it, three levels down at most. Worktrees, dependencies, hidden
 * folders and the runner's own run folders are skipped. Those without an `origin` remote are listed
 * apart, since a run ends by pushing its branch there.
 */
export function checkoutsIn(cwd, { git: run = git, depth = 3 } = {}) {
  const top = (dir) => {
    try {
      return run(["-C", dir, "rev-parse", "--show-toplevel"]);
    } catch {
      return "";
    }
  };
  const roots = [];
  const own = top(cwd);
  if (own) roots.push(own);
  else {
    const walk = (dir, left) => {
      let names = [];
      try {
        names = readdirSync(dir);
      } catch {
        return;
      }
      if (names.includes(".git")) {
        // A .git file is a worktree of a checkout found elsewhere, not a repo of its own.
        try {
          if (statSync(join(dir, ".git")).isDirectory()) roots.push(top(dir) || dir);
        } catch {}
        return;
      }
      if (!left) return;
      for (const n of names.sort()) {
        if (n.startsWith(".") || n === "node_modules" || n.endsWith(".passalong-runs")) continue;
        const p = join(dir, n);
        try {
          if (statSync(p).isDirectory()) walk(p, left - 1);
        } catch {}
      }
    };
    walk(cwd, depth);
  }
  const found = [];
  const skipped = [];
  for (const root of roots) {
    let remote = "";
    try {
      remote = run(["-C", root, "remote", "get-url", "origin"]);
    } catch {}
    if (remote) found.push({ root, remote });
    else skipped.push(root);
  }
  return { found, skipped };
}

/** This computer as a person knows it: "Lukman's MacBook Pro" on a Mac, its host name elsewhere. */
export function machineName() {
  if (platform() === "darwin") {
    try {
      const name = execFileSync("scutil", ["--get", "ComputerName"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (name) return name;
    } catch {}
  }
  return hostname();
}
