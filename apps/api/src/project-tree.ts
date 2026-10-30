/**
 * Where a folder may sit: who can see one, and whether a move keeps the tree a tree.
 *
 * Imports no sibling, so `test/folder-tree.test.mjs` can run it against real SQLite with every
 * migration applied — the same reason `claims.ts` stands alone. `folders.ts` is the only caller.
 */
type Db = D1Database;

export type Folder = {
  id: string;
  created_by: string;
  team_id: string;
  title: string;
  description: string;
  parent_id: string;
  color: string;
  /** The repo it is built from, as the person wrote it ("github.com/acme/billing"); '' for none. */
  repo: string;
  /** The secret in the folder's share link; empty when it is not shared (migration 0048). */
  share_key: string;
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

/** A personal folder is its creator's alone; a team folder is every current member's. */
export async function findVisible(db: Db, account: string, folderId: string) {
  const folder = await db
    .prepare("SELECT * FROM folder WHERE id = ?")
    .bind(folderId)
    .first<Folder>();
  if (!folder) return null;
  if (!folder.team_id) return folder.created_by === account ? folder : null;
  const member = await db
    .prepare("SELECT 1 FROM membership WHERE team_id = ? AND account_id = ?")
    .bind(folder.team_id, account)
    .first();
  return member ? folder : null;
}

/** True when `parentId` is `folderId` itself or sits anywhere beneath it. */
export async function wouldCycle(db: Db, folderId: string, parentId: string) {
  const ancestor = await db
    .prepare(
      `WITH RECURSIVE chain(id, parent_id) AS (
         SELECT id, parent_id FROM folder WHERE id = ?
         UNION ALL
         SELECT f.id, f.parent_id FROM folder f JOIN chain p ON f.id = p.parent_id
       ) SELECT 1 FROM chain WHERE id = ? LIMIT 1`,
    )
    .bind(parentId, folderId)
    .first();
  return Boolean(ancestor);
}

/**
 * Why `folder` cannot move under `parentId`, as the status and words the route answers with, or
 * null when it can. An empty `parentId` is the top level, which is always allowed.
 */
export async function moveProblem(
  db: Db,
  account: string,
  folder: Pick<Folder, "id" | "team_id">,
  parentId: string,
): Promise<{ status: 404 | 409; message: string } | null> {
  if (!parentId) return null;
  const parent = await findVisible(db, account, parentId);
  // A parent you cannot see and one in another space are refused alike, so a refusal does not
  // confirm that somebody else's folder exists.
  if (!parent || parent.team_id !== folder.team_id)
    return { status: 404, message: "The project it goes inside isn't available in this space." };
  if (await wouldCycle(db, folder.id, parentId))
    return {
      status: 409,
      message: "A project can't be moved inside itself or a project inside it.",
    };
  return null;
}
