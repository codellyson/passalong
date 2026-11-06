// The runner: `passalong work --watch` (docs/LOOP.md §1a). Left running with a repo checked out,
// it takes work a person ticked Safe to run alone and starts Claude Code on each piece, with nobody
// watching.
//
// Each piece gets its own git worktree, on a branch of its own, so up to three agents can work at
// once without touching each other's files, and each one's change arrives as a pull request a
// person reviews: what it hands in waits for them to approve it or send it back. A run that ends
// without the work done (the agent gave up, said it was blocked, or ran out of time) gives the work
// back to whoever wrote it, with the agent's last note, and clears its Safe to run alone tick, so
// it is not tried again unwatched until a person has looked (2026-11-06). What the agent is told
// and may run comes from the server with each piece of work (the brief); the copy here is for a
// server that sends none.
//
// Everything that touches git, the clock or a process is passed in, so the tests can run it.

import { execFileSync, spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { hostname, platform } from "node:os";
import { basename, delimiter, dirname, join, relative } from "node:path";

/**
 * How many agents at once, and how long one run may take. There is no count of runs a day: it was
 * ten, and a loop that gave the same work back over and over spent all ten on nothing, so the
 * runner sat idle with work waiting (2026-11-06). What limits a runner now is the agent's own usage
 * (`usageOut`: it pauses until that comes back) and the work the Passalong plan lets you keep.
 */
export const LIMITS = { atOnce: 3, minutes: 60 };

/** How long a runner waits to try again when its agent's usage ran out and it didn't say until when. */
export const USAGE_RETRY_MS = 15 * 60 * 1000;

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

/** Where a checkout's origin is hosted, for how a run ends: a pull request or a merge request. */
export const forgeOf = (remote) => (/gitlab/i.test(String(remote || "")) ? "gitlab" : "github");

/** The branch a piece of work's change goes on. */
export const branchOf = (id) => `passalong/${id}`;

/**
 * Claude Code, started for one piece of work: headless, refusing anything not allowed above, and
 * with Passalong's MCP server named here, because `passalong setup` registers it for one folder and
 * a fresh worktree is another. The server runs in the worktree, so it is that worktree's agent: the
 * one that took the work. The prompt goes in on stdin.
 */
export function claudeCommand({ node = process.execPath, cli, permissions = PERMISSIONS } = {}) {
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
      JSON.stringify({ permissions }),
      "--mcp-config",
      JSON.stringify({ mcpServers: { passalong: { command: node, args: [cli, "mcp"] } } }),
    ],
    stdin: true,
  };
}

/** What the agent is told: the work itself, and how to finish it as a pull request. */
export function runnerPrompt(t, branch = branchOf(t.id), { forge = "github" } = {}) {
  // GitLab has no `gh`: a push option opens the merge request, and git prints its link.
  const ship =
    forge === "gitlab"
      ? [
          `When it is done, commit what you changed with a message starting "${t.id}: ", then run`,
          `exactly \`git push -u origin ${branch} -o merge_request.create\`, which opens a merge`,
          "request and prints its link. Then call hand_in with id " + t.id + ", `pr` set to that",
          "link (or the commit hash if the push failed, and say why in the note), `note`: one plain",
        ]
      : [
          `When it is done, commit what you changed with a message starting "${t.id}: ", then run`,
          `exactly \`git push -u origin ${branch}\` and open a pull request with`,
          `\`gh pr create --fill --head ${branch}\`. Then call hand_in with id ${t.id}, \`pr\` set to the`,
          "pull request's URL (or the commit hash if the push or the pull request failed, and say why in",
          "the note), `note`: one plain",
        ];
  return [
    `You hold passalong work ${t.id}, and no other agent can take it while you do. Here it is:`,
    "",
    String(t.markdown || "").trim(),
    "",
    `First call the passalong MCP tool take with id ${t.id}: it hands you any notes a person left.`,
    "If this branch already has commits, an earlier run was sent back from review, and those notes",
    "say what to change: start from what is there and change that, rather than starting over.",
    "",
    `Do it in this worktree, which is on its own branch, ${branch}. Read it, work out what done`,
    `means, and get there. Call the passalong MCP tool progress with id ${t.id} and a one-line`,
    "status at each milestone; 30 minutes of silence stalls it.",
    "",
    ...ship,
    "sentence saying what you did, and `evidence`: what you ran and",
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
    "",
    "Never call pass yourself. If you stop without hand_in, the runner gives the work back",
    "unfinished and shows your last message as the reason, so end with what is done and what",
    "isn't, in plain sentences.",
  ].join("\n");
}

/**
 * What an agent is told when its run starts again after a person answered its question: read the
 * answer, then finish exactly as the first run was told to.
 */
export function resumePrompt(t, branch = branchOf(t.id), opts = {}) {
  return [
    `You hold passalong work ${t.id} (${t.title || t.id}), and you stopped earlier to ask the person`,
    `a question. They have answered. Call the passalong MCP tool take with id ${t.id} first: their`,
    "answer comes back with it. Then carry on in this worktree, where your earlier changes are, and",
    "finish as before:",
    "",
    runnerPrompt({ ...t, markdown: "" }, branch, opts)
      .split("\n")
      .slice(4)
      .join("\n"),
  ].join("\n");
}

/**
 * What an agent is told when its run starts again after it stopped part-way, because Claude's usage
 * ran out or the runner was stopped: the work is still held, its changes are in this worktree.
 */
export function pausedPrompt(t, branch = branchOf(t.id), opts = {}) {
  return [
    `You hold passalong work ${t.id} (${t.title || t.id}). An earlier run on it stopped before it`,
    "finished, because Claude's usage ran out or the runner was stopped. Call the passalong MCP tool",
    `take with id ${t.id} first to read the work again. Then look at what is already done in this`,
    "worktree (git status, git log), carry on from there, and finish as before:",
    "",
    runnerPrompt({ ...t, markdown: "" }, branch, opts)
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

/** How many runs have started today, kept in `file` beside the rest of the CLI's state: shown, not a limit. */
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

/**
 * Why a run gave its work back, said to whoever wrote it and to the team's channel. It leads with
 * what the agent itself said at the end, which is nearly always the reason ("Not done: I couldn't
 * start the app to take the screenshots"). It said "stopped without finishing (exit 0)", which
 * means nothing to a person, and "the last thing it printed", cut mid-word (2026-11-06).
 */
export function passBack({ minutes, timedOut, exit, note, said, branch, failed, machine }) {
  const how = failed
    ? `couldn't start it (${failed})`
    : timedOut
      ? `ran out of its ${minutes} minutes`
      : exit === 0
        ? "ended its run without handing it in"
        : `stopped with an error${exit === undefined || exit === null || exit === "" ? "" : ` (${typeof exit === "number" ? `exit code ${exit}` : exit})`}`;
  const words = sentences(note || said, 600);
  return [
    `The runner's agent ${how}.`,
    words ? `It said: "${words}"` : "It didn't say why.",
    "It's back in To do and no longer marked safe to run alone, so no runner takes it again until someone ticks it.",
    failed ? "" : `What it changed is kept on branch ${branch}${machine ? ` on ${machine}` : ""}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** At most `max` characters, ended at a sentence or a word rather than mid-word. */
export function sentences(text, max) {
  const one = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (stop > max * 0.5) return cut.slice(0, stop + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Whether what an agent said means its usage ran out (Claude Code's plan limit, or the API refusing
 * for rate or credit), and when it comes back: `{ until }` in ms, 0 when it didn't say. `null` when
 * it means something else. Only Claude Code's own phrasings, in short messages: an agent that ran
 * out says so in a line, and one that added "a daily limit" to someone's app must not pause.
 */
export const USAGE_OUT =
  "usage limit reached|hit your (usage |session |weekly )?limit|(session|weekly|5-hour|five-hour|opus|sonnet) limit reached|out of (extra )?usage|rate_limit_error|credit balance is too low";

/** The server's pattern when it sent one (the brief), else this copy; a bad one falls back too. */
function usagePattern(source) {
  try {
    return new RegExp(source || USAGE_OUT, "i");
  } catch {
    return new RegExp(USAGE_OUT, "i");
  }
}

export function usageOut(text, now = Date.now(), pattern = USAGE_OUT) {
  const s = String(text ?? "").trim();
  if (!s || s.length > 400) return null;
  if (!usagePattern(pattern).test(s)) return null;
  // "Claude AI usage limit reached|1736789000": when it resets, in seconds.
  const epoch = s.match(/\|(\d{10})\b/);
  if (epoch) return { until: Number(epoch[1]) * 1000 };
  // "resets 3pm", "resets at 5:30 pm": the next time the clock says that, on this machine.
  const at = s.match(/resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (at) {
    let h = Number(at[1]) % 12;
    if (!at[3]) h = Number(at[1]) % 24;
    else if (at[3].toLowerCase() === "pm") h += 12;
    const d = new Date(now);
    d.setHours(h, Number(at[2] || 0), 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return { until: d.getTime() };
  }
  return { until: 0 };
}

/** "3:00 pm", for saying when a paused runner carries on. */
export const clockOf = (ms) =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

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
 * `{ exit, timedOut, said, usage }`, never rejects: an agent that would not start is a run that ended without
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
  usage: usageSource = USAGE_OUT,
}) {
  return new Promise((resolve) => {
    let timedOut = false;
    let child;
    /** What the agent said at the end (Claude Code's result), for why it gave the work back. */
    let said = "";
    /** Set when it said its usage ran out (usageOut): the run is paused, not given up. */
    let usage = null;
    const done = (r) => resolve({ ...r, said, usage });
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
          const d = describe(line, cwd, usageSource);
          if (d.said) said = d.said;
          usage = d.usage || usage;
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
export function describe(line, cwd = "", usage = USAGE_OUT) {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    const text = hideSecrets(one(line, 300));
    return { log: text, step: text, usage: usageOut(line, Date.now(), usage) };
  }
  if (!e || typeof e !== "object") return { log: hideSecrets(one(line, 300)), step: "" };
  if (e.type === "system" && e.subtype === "init")
    return { log: `started${e.model ? ` (${e.model})` : ""}`, step: "" };
  if (e.type === "assistant") {
    // Claude Code writes the refusal as a message of its own, marked with what went wrong.
    if (["rate_limit", "billing_error"].includes(e.error)) {
      const said = (e.message?.content ?? []).map((c) => c.text || "").join(" ");
      const text = hideSecrets(one(said || "Claude's usage ran out", 200));
      return { log: text, step: "", usage: usageOut(said, Date.now(), usage) || { until: 0 } };
    }
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
    // Its whole last message, too: when the work comes back unfinished, this is why.
    return {
      log: text,
      step: text,
      said: hideSecrets(String(e.result || "").trim()),
      usage: usageOut(e.result, Date.now(), usage),
    };
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

/**
 * Other copies of passalong on PATH, besides the one at `cli`: their path and version, and whether
 * one of them comes first, so `passalong` typed in a shell runs it rather than this. npm and pnpm
 * each keep their own global copy, and updating one left an old runner running from the other
 * (2026-11-06). Each version is read from the package.json beside the bin's real file.
 */
export function otherCopies(cli, { path = process.env.PATH || "" } = {}) {
  const real = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return "";
    }
  };
  const versionAt = (file) => {
    try {
      return (
        JSON.parse(readFileSync(join(dirname(file), "..", "package.json"), "utf8")).version || ""
      );
    } catch {
      return "";
    }
  };
  const mine = real(cli);
  const seen = new Set();
  const found = [];
  for (const dir of path.split(delimiter).filter(Boolean)) {
    const bin = join(dir, process.platform === "win32" ? "passalong.cmd" : "passalong");
    if (!existsSync(bin)) continue;
    const file = real(bin);
    if (!file || seen.has(file)) continue;
    seen.add(file);
    found.push({ path: bin, version: versionAt(file), mine: file === mine });
  }
  const others = found.filter((f) => !f.mine);
  return { others, shadowed: found.length > 0 && !found[0].mine };
}
