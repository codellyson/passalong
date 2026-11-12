/**
 * What a URL in a note points at, read from the URL alone: a piece of work here, or something on
 * GitHub. Nothing is fetched to decide it, so a private repo's link reads as well as a public one.
 *
 * Imports nothing, so it runs under `node --test` without Nuxt.
 */

/** Every host this product has served work from: a link copied from any of them is ours. */
const OURS = new Set(["passalong.dev", "www.passalong.dev", "passalong.kreativekorna.com"]);

export type LinkKind =
  | {
      kind: "work";
      id: string /** It was a share link, which the hub may not let this reader open. */;
      shared: boolean;
    }
  | {
      kind: "github";
      repo: string /** Short, as GitHub's own references read: `#2800`, `7f0d83e`. */;
      ref: string;
      what: string;
    };

const GITHUB_WHAT: Record<string, string> = {
  pull: "Pull request",
  issues: "Issue",
  commit: "Commit",
  runs: "Workflow run",
};

export function linkKind(url: string, here = ""): LinkKind | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname.split("/").filter(Boolean);
  if (OURS.has(host) || (here && u.host === here)) {
    if (path[0] === "hub" && path[1] === "w" && path[2] && path.length === 3)
      return { kind: "work", id: path[2], shared: false };
    if (path[0] === "w" && path[1] && path[2] && path.length === 3)
      return { kind: "work", id: path[1], shared: true };
    return null;
  }
  if (host !== "github.com" && host !== "www.github.com") return null;
  const [owner, repo, section, n, more, run] = path;
  if (!owner || !repo) return null;
  const name = `${owner}/${repo}`;
  if ((section === "pull" || section === "issues") && /^\d+$/.test(n || ""))
    return { kind: "github", repo: name, ref: `#${n}`, what: GITHUB_WHAT[section] as string };
  if (section === "commit" && /^[0-9a-f]{7,40}$/i.test(n || ""))
    return { kind: "github", repo: name, ref: (n as string).slice(0, 7), what: "Commit" };
  if (section === "actions" && n === "runs" && /^\d+$/.test(more || ""))
    return { kind: "github", repo: name, ref: `run ${more}`, what: GITHUB_WHAT.runs as string };
  if (!section && run === undefined)
    return { kind: "github", repo: name, ref: "", what: "Repository" };
  return null;
}

/** A piece of work's place, in the board's own words. */
export function workStage(w: { status: string; outcome?: string; held_by?: unknown[] }): string {
  if (w.status === "draft") return "Draft";
  if (w.status === "done") return w.outcome === "archived" ? "Archived" : "Done";
  return w.held_by?.length ? "In progress" : "Ready";
}
