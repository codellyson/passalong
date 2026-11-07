/**
 * Where a project may sit: who can see one, and whether a move keeps the tree a tree.
 *
 * Imports no sibling, so `test/project-tree.test.mjs` can run it against real SQLite with every
 * migration applied — the same reason `claims.ts` stands alone. `projects.ts` is the only caller.
 */
type Db = D1Database;

export type Project = {
  id: string;
  created_by: string;
  team_id: string;
  title: string;
  description: string;
  parent_id: string;
  color: string;
  /** The repo it is built from, as the person wrote it ("github.com/acme/billing"); '' for none. */
  repo: string;
  /** The secret in the project's share link; empty when it is not shared (migration 0048). */
  share_key: string;
  /** When it was archived, '' while it is in use (migration 0070). */
  archived: string;
  /** 'repo' or 'default' when Passalong made it, '' when a person or agent did (migration 0082). */
  auto?: string;
  /** When someone answered whether its repo joins a product; '' until then (migration 0082). */
  join_answered?: string;
  created: string;
  updated: string;
};

/**
 * A repo as a person or agent wrote it: trimmed, one token, at most 200 characters; '' clears it.
 * `null` when it cannot be one (spaces inside, too long, not a string), so the route says so.
 */
export function repoOf(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const repo = value.trim();
  return repo.length > 200 || /\s/.test(repo) ? null : repo;
}

/** A personal project is its creator's alone; a team project is every current member's. */
export async function findVisible(db: Db, account: string, projectId: string) {
  const project = await db
    .prepare("SELECT * FROM project WHERE id = ?")
    .bind(projectId)
    .first<Project>();
  if (!project) return null;
  if (!project.team_id) return project.created_by === account ? project : null;
  const member = await db
    .prepare("SELECT 1 FROM membership WHERE team_id = ? AND account_id = ?")
    .bind(project.team_id, account)
    .first();
  return member ? project : null;
}

/** True when `parentId` is `projectId` itself or sits anywhere beneath it. */
export async function wouldCycle(db: Db, projectId: string, parentId: string) {
  const ancestor = await db
    .prepare(
      `WITH RECURSIVE chain(id, parent_id) AS (
         SELECT id, parent_id FROM project WHERE id = ?
         UNION ALL
         SELECT f.id, f.parent_id FROM project f JOIN chain p ON f.id = p.parent_id
       ) SELECT 1 FROM chain WHERE id = ? LIMIT 1`,
    )
    .bind(parentId, projectId)
    .first();
  return Boolean(ancestor);
}

/**
 * Why `project` cannot move under `parentId`, as the status and words the route answers with, or
 * null when it can. An empty `parentId` is the top level, which is always allowed.
 */
export async function moveProblem(
  db: Db,
  account: string,
  project: Pick<Project, "id" | "team_id">,
  parentId: string,
): Promise<{ status: 404 | 409; message: string } | null> {
  if (!parentId) return null;
  const parent = await findVisible(db, account, parentId);
  // A parent you cannot see and one in another space are refused alike, so a refusal does not
  // confirm that somebody else's project exists.
  if (!parent || parent.team_id !== project.team_id)
    return { status: 404, message: "The project it goes inside isn't available in this space." };
  if (await wouldCycle(db, project.id, parentId))
    return {
      status: 409,
      message: "A project can't be moved inside itself or a project inside it.",
    };
  return null;
}

/** At most this much of a project's README goes in front of work an agent takes; read_document has the rest. */
export const README_SHOWN = 4000;
/** And at most this many of its other documents are named there. */
export const DOCUMENTS_NAMED = 20;
/** Work filed in several projects brings at most this many. */
const PROJECTS_SHOWN = 3;

/** What an agent is handed about one project its work is filed in. */
export interface ProjectContext {
  id: string;
  title: string;
  description: string;
  repo: string;
  /** Every repo it is built from, the main one first; [] for none. */
  repos?: string[];
  /** The document named README, or the head of it; null when the project has none. */
  readme: { id: string; body: string; cut: boolean } | null;
  /** Its other documents, by name, for the agent to open the ones that bear on the work. */
  documents: { id: string; name: string }[];
  /** How many more documents there are than are named. */
  more: number;
}

/**
 * What an agent should know before it starts on a piece of work: each project the work is filed in
 * that `account` can see, with its README and the names of its other documents.
 *
 * The reader puts work in a project when it files it, and a project's documents are where the
 * people who know a product wrote it down — but taking work handed over the work alone, so an
 * agent was told to write what it learned into documents it was never shown. This is the context,
 * from people, where the alternative was the reader writing steps it could only guess at.
 */
export async function contextFor(
  db: Db,
  account: string,
  workId: string,
): Promise<ProjectContext[]> {
  const { results: links } = await db
    .prepare("SELECT project_id FROM project_work WHERE work_id = ? ORDER BY added LIMIT ?")
    .bind(workId, PROJECTS_SHOWN)
    .all<{ project_id: string }>();
  const out: ProjectContext[] = [];
  for (const link of links) {
    const project = await findVisible(db, account, link.project_id);
    if (!project) continue;
    // Names only: a project may hold a hundred documents, and only the README is read here.
    const { results: docs } = await db
      .prepare("SELECT id, name FROM document WHERE project_id = ? ORDER BY name COLLATE NOCASE")
      .bind(project.id)
      .all<{ id: string; name: string }>();
    const named = docs.find((d) => /^readme(\.md)?$/i.test(d.name.trim()));
    const readme = named
      ? await db
          .prepare("SELECT body FROM document WHERE id = ?")
          .bind(named.id)
          .first<{ body: string }>()
      : null;
    const others = docs.filter((d) => d.id !== named?.id);
    // All its repos, the main one first (migration 0081), so an agent in any of them knows.
    const { results: more } = await db
      .prepare("SELECT repo FROM project_repo WHERE project_id = ? ORDER BY added, rowid")
      .bind(project.id)
      .all<{ repo: string }>();
    out.push({
      id: project.id,
      title: project.title,
      description: project.description,
      repo: project.repo,
      repos: [project.repo, ...more.map((r) => r.repo)].filter(Boolean),
      readme:
        named && readme
          ? {
              id: named.id,
              body: readme.body.slice(0, README_SHOWN),
              cut: readme.body.length > README_SHOWN,
            }
          : null,
      documents: others.slice(0, DOCUMENTS_NAMED),
      more: Math.max(0, others.length - DOCUMENTS_NAMED),
    });
  }
  return out;
}
