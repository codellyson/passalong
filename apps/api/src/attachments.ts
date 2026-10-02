/**
 * Files that are not pictures: what may be stored, how it is told apart, and how the ones nobody
 * wants go away. The sibling of shots.ts, and it imports nothing for the same reason — it is tested
 * against a real SQLite, and a value import of a sibling is what Node's type stripping cannot follow.
 *
 * The risk is the reverse of a screenshot's. A shot is served to be drawn, so the danger is what a
 * page fetches; a file is served to be saved, so the danger is what it can do on our origin if
 * anything ever opens it. Everything here follows from refusing to let it: the type is decided by
 * the bytes and never by what the sender called them, anything outside a short list is refused, and
 * the route serves every file as a download that nothing may sniff or run.
 */

interface AttachEnv {
  DB: D1Database;
  SHOTS?: R2Bucket;
}

/** The most one file may weigh. A person attaching a log or a PDF, not a dataset. */
export const ATTACH_MAX = 10 * 1024 * 1024;

/** Unclaimed uploads one account may hold. A loop that uploads hits this before it fills the bucket. */
export const ATTACH_OPEN_MAX = 20;

/** What is kept, by the type it is stored and served as. The value is the extension it is given. */
export const ATTACH_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/plain": "txt",
  "text/csv": "csv",
  "text/markdown": "md",
  "application/json": "json",
};

/** Where the bytes live. Under its own prefix, so a shot's key and a file's can never be the same. */
export const attachmentKey = (id: string, type: string) =>
  `files/${id}.${ATTACH_TYPES[type] || "bin"}`;

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  bytes.length >= signature.length && signature.every((b, i) => bytes[i] === b);

/** Text that is text: valid UTF-8, and no NUL, which is what a binary posing as a log gives away. */
function isText(bytes: Uint8Array): boolean {
  if (bytes.subarray(0, 8192).includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * What a file is, from its bytes, or null when it is not something we keep.
 *
 * The declared type and the name are hints and nothing more: `content-type` is whatever the sender
 * wrote, and "report.pdf" is a name. A PDF and a zip are known by their signatures, and a text file
 * by being text. A word processor's or spreadsheet's document is a zip and is kept as one. Text is
 * filed as the kind the sender said it was when that is one we keep, and as plain text otherwise —
 * which includes a log, a patch, and an SVG, none of which is ever drawn.
 */
export function sniffAttachment(bytes: Uint8Array, declared = "", name = ""): string | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]))
    return "application/zip";
  if (!bytes.length || !isText(bytes)) return null;
  const said = declared.split(";")[0]?.trim().toLowerCase() || "";
  const ext = /\.([a-z0-9]{1,8})$/i.exec(name)?.[1]?.toLowerCase() || "";
  if (said === "application/json" || ext === "json") return "application/json";
  if (said === "text/csv" || ext === "csv") return "text/csv";
  if (said === "text/markdown" || ext === "md" || ext === "markdown") return "text/markdown";
  return "text/plain";
}

/**
 * A name safe to put in a header and to show: no path, no control characters, no quotes, and not
 * so long it is a problem. Never empty, because a download has to be called something.
 */
export function safeName(raw: string, type = "text/plain"): string {
  const base = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f"\\/<>|:*?\[\]()]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return base || `file.${ATTACH_TYPES[type] || "bin"}`;
}

/** The ids of the attachments a document points at, from `/v1/attachments/<id>` wherever it appears. */
export function attachmentIds(text: string): string[] {
  const found = text.matchAll(/\/v1\/attachments\/([a-z0-9]{6,16})\b/g);
  return [...new Set([...found].map((m) => m[1] as string))];
}

/** What claiming needs: who, for what guide, what they wrote, and what the guide carries overall. */
interface Hold {
  account: string;
  guide: string;
  /** Ids in what this caller just wrote. Only these are claimed, and only for `account`. */
  mine: string[];
  /** Ids the guide points at from anywhere. Anything outside this is released. */
  carried: string[];
}

/**
 * Point a guide at the files it carries, and let go of any it no longer does. The same two lists and
 * the same reasoning as `holdShots`: `mine` decides what this caller may claim, and `account_id` is in
 * that WHERE so naming somebody else's id takes nothing; `carried` decides what is released, because a
 * guide's files come from its markdown and from every reply on it, written by different people.
 *
 * A released file becomes an orphan and is swept, not deleted here: a write is the wrong moment to
 * decide nobody wants a file.
 */
export async function holdAttachments(
  db: D1Database,
  { account, guide, mine, carried }: Hold,
): Promise<void> {
  const keep = [...new Set([...mine, ...carried])];
  const statements = [];
  if (mine.length)
    statements.push(
      db
        .prepare(
          `UPDATE attachment SET guide_id = ? WHERE account_id = ? AND id IN (${mine
            .map(() => "?")
            .join(",")})`,
        )
        .bind(guide, account, ...mine),
    );
  statements.push(
    keep.length
      ? db
          .prepare(
            `UPDATE attachment SET guide_id = '' WHERE guide_id = ? AND id NOT IN (${keep
              .map(() => "?")
              .join(",")})`,
          )
          .bind(guide, ...keep)
      : db.prepare("UPDATE attachment SET guide_id = '' WHERE guide_id = ?").bind(guide),
  );
  await db.batch(statements);
}

/**
 * Delete files no guide ever claimed, or let go of. Same bargain as the screenshots': the age is the
 * whole safety of it, the bucket goes first because an object with no row is invisible waste while a
 * row with no object is a dead download, and if the bucket refuses we stop and try the same batch
 * tomorrow rather than strand objects nothing would ever look for again.
 */
export async function sweepAttachments(env: AttachEnv, { hours = 24, limit = 500 } = {}) {
  const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
  const { results } = await env.DB.prepare(
    "SELECT id, type FROM attachment WHERE guide_id = '' AND created < ? ORDER BY created LIMIT ?",
  )
    .bind(cutoff, limit)
    .all<{ id: string; type: string }>();
  if (!results.length) return { swept: 0, deferred: 0 };
  if (env.SHOTS) {
    try {
      await env.SHOTS.delete(results.map((r) => attachmentKey(r.id, r.type)));
    } catch {
      return { swept: 0, deferred: results.length };
    }
  }
  const ids = results.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100);
    await env.DB.prepare(`DELETE FROM attachment WHERE id IN (${slice.map(() => "?").join(",")})`)
      .bind(...slice)
      .run();
  }
  return { swept: results.length, deferred: 0 };
}
