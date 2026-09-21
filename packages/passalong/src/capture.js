// Fallback capture when no agent wrote a draft: scaffold one from the working directory so the
// developer starts from "what changed" instead of a blank page. The Claude Code skill in
// skills/passalong-capture does the real distillation from a session transcript.
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { template } from "./guide.js";

function git(cwd, ...args) {
  try {
    return execFileSync("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

/**
 * One repo, written one way, so a task and the agent asking for work agree on what it is called.
 * A remote URL becomes `owner/repo` whichever form it came in; anything else is kept, lowercase.
 * Mirrors `repoKey()` in apps/api/src/claims.ts, which normalises what it stores the same way.
 */
export function repoKey(raw) {
  let s = String(raw ?? "")
    .trim()
    .toLowerCase();
  s = s.replace(/\/+$/, "").replace(/\.git$/, "");
  const url = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?[^:/]+[:/](.+\/[^/]+)$/.exec(s);
  if (url && (s.includes("://") || s.includes("@"))) {
    return url[1].split("/").filter(Boolean).slice(-2).join("/");
  }
  return s;
}

/** What we can infer about the current context without reading any session. */
export function context(cwd = process.cwd()) {
  const root = git(cwd, "rev-parse", "--show-toplevel");
  const name = basename(root || cwd);
  const branch = root ? git(cwd, "rev-parse", "--abbrev-ref", "HEAD") : "";
  const author = git(cwd, "config", "user.name");
  const commits = root ? git(cwd, "log", "--oneline", "-8").split("\n").filter(Boolean) : [];
  const changed = root
    ? git(cwd, "diff", "--stat", "HEAD~5..HEAD").split("\n").filter(Boolean).slice(-1)[0] || ""
    : "";
  const files = root
    ? git(cwd, "diff", "--name-only", "HEAD~5..HEAD").split("\n").filter(Boolean)
    : [];
  // The repo as the task queue names it: its remote when it has one, because two worktrees of one
  // repo have two folder names and one remote. The folder name when there is no remote.
  const repo = root ? repoKey(git(cwd, "remote", "get-url", "origin") || name) : "";
  return { root, name, repo, branch, author, commits, changed, files };
}

/**
 * A task draft from one sentence: the sentence as the title and the Goal, the rest left to fill.
 *
 * `target_context` defaults to the repo this runs in, because that is the likeliest repo a task
 * written from inside one is for — and it is in the editor, in the frontmatter, for the author
 * to change before it goes anywhere. Outside a repo it stays empty, which is a task for no repo.
 */
export function taskScaffold(sentence, cwd = process.cwd()) {
  const c = context(cwd);
  const md = template({
    kind: "task",
    title: sentence,
    author: c.author,
    source_context: c.branch && c.branch !== "HEAD" ? `${c.name}@${c.branch}` : c.name,
    target_context: c.repo,
  });
  return md.replace(/^## Goal\n/m, `## Goal\n${sentence}\n`);
}

/** A draft pre-filled with repo facts. Recent activity is appended as a comment for reference. */
export function scaffold(cwd = process.cwd()) {
  const c = context(cwd);
  let md = template({
    kind: "transfer",
    title: "",
    author: c.author,
    source_context: c.branch && c.branch !== "HEAD" ? `${c.name}@${c.branch}` : c.name,
  });
  if (c.commits.length) {
    md += [
      "",
      "<!-- passalong: recent activity in this repo, for reference while you write. Delete when done.",
      ...c.commits.map((l) => `  ${l}`),
      c.changed ? `  ${c.changed}` : "",
      ...c.files.slice(0, 30).map((f) => `  ${f}`),
      "-->",
      "",
    ].join("\n");
  }
  return md;
}
