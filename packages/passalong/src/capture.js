// What can be learned about where a command runs, without reading any session: the repo, its
// branch, who is committing. Work written from inside a repo is for that repo.
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { serialize } from "./work.js";

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
  // A host with no scheme: "github.com/acme/billing" (apps/api claims.ts repoKey, 2026-11-07).
  const bare = s.split("/").filter(Boolean);
  if (bare.length >= 3 && bare[0].includes(".")) return bare.slice(-2).join("/");
  return s;
}

/**
 * The open pull request for the branch this runs on, as a link, or "". It is what a person opens to
 * see what a hand-in changed, and agents often open one without passing it on (2026-11-07). Asked of
 * GitHub's own `gh`, signed in as whoever runs this; without it, or with no open pull request, "".
 */
export function openPullRequest(cwd = process.cwd()) {
  if (!git(cwd, "rev-parse", "--show-toplevel")) return "";
  try {
    const url = execFileSync(
      "gh",
      ["pr", "view", "--json", "url,state", "-q", 'select(.state == "OPEN") | .url'],
      {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8",
        timeout: 5000,
        env: { ...process.env, GH_PROMPT_DISABLED: "1" },
      },
    ).trim();
    return /^https?:\/\/\S+$/.test(url) ? url : "";
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
  // The repo as the task queue names it: its remote when it has one, because two worktrees of one
  // repo have two project names and one remote. The project name when there is no remote.
  const repo = root ? repoKey(git(cwd, "remote", "get-url", "origin") || name) : "";
  return { root, name, repo, branch, author };
}

/**
 * A piece of work from one sentence: the sentence is its title, what it says to a person, and its
 * text, for whoever wrote it to add to before it goes.
 *
 * `target_context` is the repo this runs in, because that is the likeliest repo work written from
 * inside one is for — and it is in the frontmatter, for the author to change before it goes
 * anywhere. Outside a repo it stays empty, which is work for no repo.
 */
export function workScaffold(sentence, cwd = process.cwd()) {
  const said = String(sentence).trim();
  return serialize({
    meta: { title: said, summary: said.slice(0, 400), target_context: context(cwd).repo },
    body: `${said}\n`,
  });
}
