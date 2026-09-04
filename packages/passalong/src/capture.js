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
  return { root, name, branch, author, commits, changed, files };
}

/** A draft pre-filled with repo facts. Recent activity is appended as a comment for reference. */
export function scaffold(cwd = process.cwd()) {
  const c = context(cwd);
  let md = template({
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
