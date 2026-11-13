/**
 * What a URL in a note points at, read from the URL alone: a piece of work here, or something on
 * GitHub. Nothing is fetched to decide it, so a private repo's link reads as well as a public one.
 *
 * Imports nothing, so it runs under `node --test` without Nuxt. In shared/ because both halves
 * read it: the hub (AppLinked) and the server, which draws GitHub links in a work's document as
 * chips (work-html.ts).
 */

/** GitHub's mark on its 24-unit canvas (Simple Icons, CC0), drawn by AppMark and work-html.ts. */
export const GITHUB_MARK =
  "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12";

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

/**
 * A work id written bare in text, like `p64kbrdt`: eight characters from the id alphabet
 * (`ID_ALPHABET` in packages/passalong/src/work.js, which has no i, l, o, 0 or 1), with at least
 * one letter and one digit, so an ordinary eight-letter word never matches. Matching is not
 * knowing: whoever links it checks the work exists first.
 */
export const WORK_ID =
  /\b(?=[a-hjkmnp-z2-9]*[2-9])(?=[a-hjkmnp-z2-9]*[a-hjkmnp-z])[a-hjkmnp-z2-9]{8}\b/g;

/** Text cut into words and the bare work ids inside them. */
export function idParts(text: string): { text: string; id?: string }[] {
  const out: { text: string; id?: string }[] = [];
  let at = 0;
  for (const m of text.matchAll(WORK_ID)) {
    const start = m.index ?? 0;
    if (start > at) out.push({ text: text.slice(at, start) });
    out.push({ text: m[0], id: m[0] });
    at = start + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** A piece of work's place, in the board's own words. */
export function workStage(w: { status: string; outcome?: string; held_by?: unknown[] }): string {
  if (w.status === "draft") return "Draft";
  if (w.status === "done") return w.outcome === "archived" ? "Archived" : "Done";
  return w.held_by?.length ? "In progress" : "Ready";
}

/** The parts of a hast node ghRef reads and writes, typed here so this file imports nothing. */
export interface GhNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: GhNode[];
}
const textOf = (node: GhNode): string =>
  node.type === "text" ? node.value || "" : (node.children ?? []).map(textOf).join("");

/**
 * A link to a GitHub pull request, issue, commit or run, drawn as GitHub draws its own references:
 * the mark, then `website-builder #2955`. Read from the URL alone, so a private repo reads as well
 * as a public one, and only when the link's words are the URL itself — a link someone worded
 * ("the fix") keeps their words. The chip is markup and a stylesheet rule (`a.gh-ref`), with no
 * script, so it holds on a share page and in the hub's frame alike. Used by both renderers: a
 * work's document (work-html.ts) and a project's documents (project-markdown.ts).
 */
export function ghRef(a: GhNode): GhNode {
  const href = String(a.properties?.href ?? "");
  const kind = linkKind(href);
  if (kind?.kind !== "github" || textOf(a).trim() !== href) return a;
  const name = kind.ref ? `${kind.repo.split("/")[1]} ${kind.ref}` : kind.repo;
  return {
    type: "element",
    tagName: "a",
    properties: {
      ...a.properties,
      className: ["gh-ref"],
      ariaLabel: `${kind.what}${kind.ref ? ` ${kind.ref}` : ""} in ${kind.repo} on GitHub`,
    },
    children: [
      {
        type: "element",
        tagName: "svg",
        properties: { viewBox: "0 0 24 24", ariaHidden: "true", focusable: "false" },
        children: [{ type: "element", tagName: "path", properties: { d: GITHUB_MARK } }],
      },
      { type: "text", value: name },
    ],
  };
}
