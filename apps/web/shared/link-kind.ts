/**
 * What a URL in a note points at, read from the URL alone: a piece of work here, or something on
 * a code forge — GitHub or GitLab. Nothing is fetched to decide it, so a private repo's link reads
 * as well as a public one.
 *
 * Imports nothing, so it runs under `node --test` without Nuxt. In shared/ because both halves
 * read it: the hub (AppLinked) and the server, which draws forge links in a work's document as
 * chips (work-html.ts).
 */

/** GitHub's and GitLab's marks on their 24-unit canvas (Simple Icons, CC0), drawn by AppMark and work-html.ts. */
export const GITHUB_MARK =
  "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12";

export const GITLAB_MARK =
  "m23.6 9.593-.033-.086L20.3.98a.851.851 0 0 0-.336-.405.875.875 0 0 0-1 .054.875.875 0 0 0-.29.44L16.47 7.818H7.537L5.333 1.07a.857.857 0 0 0-.29-.441.875.875 0 0 0-1-.054.859.859 0 0 0-.336.405L.433 9.502l-.032.086a6.066 6.066 0 0 0 2.012 7.01l.01.009.03.021 4.977 3.727 2.462 1.863 1.5 1.132a1.008 1.008 0 0 0 1.22 0l1.499-1.132 2.461-1.863 5.006-3.75.013-.01a6.068 6.068 0 0 0 2.01-7.002z";

/** Each forge: its name as people say it and its mark. */
export const FORGES = {
  github: { name: "GitHub", mark: GITHUB_MARK },
  gitlab: { name: "GitLab", mark: GITLAB_MARK },
} as const;
export type Forge = keyof typeof FORGES;

/** Every host this product has served work from: a link copied from any of them is ours. */
const OURS = new Set(["passalong.dev", "www.passalong.dev", "passalong.kreativekorna.com"]);

export type LinkKind =
  | {
      kind: "work";
      id: string /** It was a share link, which the hub may not let this reader open. */;
      shared: boolean;
    }
  | {
      kind: "forge";
      site: Forge;
      /** `owner/repo`, or GitLab's `group/subgroup/project`. */
      repo: string;
      /** Short, as the forge's own references read: `#2800`, `!7038`, `7f0d83e`. */
      ref: string;
      what: string;
    };

/** The name a chip shows: the project's own name and its reference, `website-builder #2955`. */
export const forgeName = (k: { repo: string; ref: string }) =>
  k.ref ? `${k.repo.split("/").at(-1)} ${k.ref}` : k.repo;

/** What a screen reader hears for a chip. */
export const forgeLabel = (k: { site: Forge; repo: string; ref: string; what: string }) => {
  // A ref that names itself ("run 9", "pipeline 99") is said once: "Workflow run 9", not "run run".
  const ref = k.ref.includes(" ") ? k.ref.slice(k.ref.indexOf(" ") + 1) : k.ref;
  return `${k.what}${ref ? ` ${ref}` : ""} in ${k.repo} on ${FORGES[k.site].name}`;
};

const GITHUB_WHAT: Record<string, string> = {
  pull: "Pull request",
  issues: "Issue",
  commit: "Commit",
  runs: "Workflow run",
};

function github(path: string[]): LinkKind | null {
  const [owner, repo, section, n, more, run] = path;
  if (!owner || !repo) return null;
  const forge = (ref: string, what: string): LinkKind => ({
    kind: "forge",
    site: "github",
    repo: `${owner}/${repo}`,
    ref,
    what,
  });
  if ((section === "pull" || section === "issues") && /^\d+$/.test(n || ""))
    return forge(`#${n}`, GITHUB_WHAT[section] as string);
  if (section === "commit" && /^[0-9a-f]{7,40}$/i.test(n || ""))
    return forge((n as string).slice(0, 7), "Commit");
  if (section === "actions" && n === "runs" && /^\d+$/.test(more || ""))
    return forge(`run ${more}`, GITHUB_WHAT.runs as string);
  if (!section && run === undefined) return forge("", "Repository");
  return null;
}

/**
 * GitLab puts a project under any depth of groups and marks where its pages begin with `/-/`:
 * `group/sub/project/-/merge_requests/7038`. A merge request reads `!7038` and an issue `#12`, as
 * GitLab writes them. Without `/-/` a path could be a group, a user or a project, so it is not
 * read at all.
 */
function gitlab(path: string[]): LinkKind | null {
  const at = path.indexOf("-");
  if (at < 2) return null;
  const repo = path.slice(0, at).join("/");
  const [section, n] = path.slice(at + 1);
  const forge = (ref: string, what: string): LinkKind => ({
    kind: "forge",
    site: "gitlab",
    repo,
    ref,
    what,
  });
  if (section === "merge_requests" && /^\d+$/.test(n || "")) return forge(`!${n}`, "Merge request");
  if ((section === "issues" || section === "work_items") && /^\d+$/.test(n || ""))
    return forge(`#${n}`, "Issue");
  if (section === "commit" && /^[0-9a-f]{7,40}$/i.test(n || ""))
    return forge((n as string).slice(0, 7), "Commit");
  if (section === "pipelines" && /^\d+$/.test(n || "")) return forge(`pipeline ${n}`, "Pipeline");
  if (section === "jobs" && /^\d+$/.test(n || "")) return forge(`job ${n}`, "Job");
  return null;
}

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
  if (host === "github.com" || host === "www.github.com") return github(path);
  // gitlab.com, and a team's own GitLab, which is nearly always gitlab.<their domain>.
  if (host === "gitlab.com" || host.startsWith("gitlab.")) return gitlab(path);
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

/** The parts of a hast node forgeRef reads and writes, typed here so this file imports nothing. */
export interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}
const textOf = (node: HastNode): string =>
  node.type === "text" ? node.value || "" : (node.children ?? []).map(textOf).join("");

/**
 * A link to a pull or merge request, an issue, a commit, a run or a pipeline on GitHub or GitLab,
 * drawn as the forge draws its own references: the mark, then `website-builder #2955` or
 * `techchak-backend !7038`. Read from the URL alone, so a private repo reads as well
 * as a public one, and only when the link's words are the URL itself — a link someone worded
 * ("the fix") keeps their words. The chip is markup and a stylesheet rule (`a.forge-ref`), with no
 * script, so it holds on a share page and in the hub's frame alike. Used by both renderers: a
 * work's document (work-html.ts) and a project's documents (project-markdown.ts).
 */
export function forgeRef(a: HastNode): HastNode {
  const href = String(a.properties?.href ?? "");
  const kind = linkKind(href);
  if (kind?.kind !== "forge" || textOf(a).trim() !== href) return a;
  return {
    type: "element",
    tagName: "a",
    properties: {
      ...a.properties,
      className: ["forge-ref"],
      ariaLabel: forgeLabel(kind),
    },
    children: [
      {
        type: "element",
        tagName: "svg",
        properties: { viewBox: "0 0 24 24", ariaHidden: "true", focusable: "false" },
        children: [{ type: "element", tagName: "path", properties: { d: FORGES[kind.site].mark } }],
      },
      { type: "text", value: forgeName(kind) },
    ],
  };
}
