/**
 * Tasks an agent can take: the queue, the claim, the lease. See docs/V2.md and
 * migrations/0021_claims.sql.
 *
 * The one rule this module exists to keep: no two agents ever hold the same task. The claim's
 * primary key is the lock, and a lease that runs out does not release it — a card whose agent
 * went quiet is `stalled`, still locked, until a person releases it or the same agent comes back.
 *
 * Imports no sibling `.ts` on purpose, like billing.ts: it is tested against a real SQLite with
 * the real migrations, and a value import of a sibling is what Node's type stripping cannot follow.
 */

/** How long a claim holds without word from its agent. Every progress call starts it again. */
export const LEASE_MS = 30 * 60 * 1000;

/** The longest progress line kept. It is a status, not a log. */
export const NOTE_MAX = 280;

/**
 * Where a task is, as a column name. Derived from the guide and its claim on every read, never
 * stored: `stalled` in particular is only "claimed, and the lease is in the past", and storing it
 * would need something running on a clock to write it.
 */
export type TaskState = "draft" | "ready" | "blocked" | "claimed" | "stalled" | "review" | "done";

export interface ClaimRow {
  guide_id: string;
  account_id: string;
  agent_id: string;
  host: string;
  repo: string;
  worktree: string;
  state: string;
  note: string;
  report_id: string;
  pr: string;
  claimed_at: string;
  lease_until: string;
  updated: string;
}

interface TaskRow {
  id: string;
  account_id: string;
  title: string;
  status: string;
  target: string;
  markdown: string;
  created: string;
}

/** Who is asking, and from where. `agent` is the worktree's stable id. */
export interface Agent {
  account: string;
  agent: string;
  host?: string;
  repo?: string;
  worktree?: string;
}

/**
 * One repo, written one way, so a task and the agent asking for work agree on what it is called.
 *
 * A remote URL becomes `owner/repo` whichever form it came in — `git@github.com:o/r.git`,
 * `https://github.com/o/r`, `ssh://git@host/o/r` — because the same repo checked out in two
 * worktrees has two folder names and one remote. Anything else is kept as written, lowercase.
 * Mirrored by `repoKey()` in packages/passalong/src/capture.js.
 */
export function repoKey(raw: unknown): string {
  let s = String(raw ?? "")
    .trim()
    .toLowerCase();
  s = s.replace(/\/+$/, "").replace(/\.git$/, "");
  const url = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?[^:/]+[:/](.+\/[^/]+)$/.exec(s);
  if (url && (s.includes("://") || s.includes("@"))) {
    const parts = (url[1] ?? "").split("/").filter(Boolean);
    return parts.slice(-2).join("/");
  }
  return s;
}

/** The column a task is in. `claim` is null when nobody has taken it. */
export function stateOf(
  guide: { status: string; blocked?: number | boolean },
  claim: Pick<ClaimRow, "state" | "lease_until"> | null,
  at: string,
): TaskState {
  if (guide.status === "consumed") return "done";
  if (guide.status === "draft") return "draft";
  if (!claim) return guide.blocked ? "blocked" : "ready";
  if (claim.state === "review") return "review";
  return claim.lease_until > at ? "claimed" : "stalled";
}

const leaseFrom = (at: string) => new Date(Date.parse(at) + LEASE_MS).toISOString();

// A task the account may see: its own, or one shared to a team it is in.
const VISIBLE = `(g.account_id = ?1 OR (g.team_id <> '' AND g.team_id IN
  (SELECT team_id FROM membership WHERE account_id = ?1)))`;

// Waiting on a task a person has not approved yet. See migrations/0022_blocks.sql.
const BLOCKED = `EXISTS (SELECT 1 FROM task_block b JOIN guide x ON x.id = b.blocker_id
  WHERE b.guide_id = g.id AND x.status <> 'consumed')`;

/**
 * Hand this agent a task, or `null` when there is nothing for it.
 *
 * An agent holds one task at a time. If it already has one — live or stalled — that is the answer,
 * and asking again renews the lease: this is how a restarted session in the same worktree takes
 * its card back. Otherwise the oldest ready task for this repo is claimed.
 *
 * Routing: an agent in a repo gets only tasks for that repo. An agent in no repo gets only tasks
 * for no repo, because a research task taken from inside a checkout tends to end with commits in
 * it. `any` lifts both.
 *
 * The claim is an insert that does nothing on conflict, so of two agents racing for one task
 * exactly one changes a row. The loser moves on to the next candidate rather than failing.
 */
export async function next(
  db: D1Database,
  who: Agent,
  { at, any = false }: { at: string; any?: boolean },
): Promise<{ task: TaskRow; claim: ClaimRow; resumed: boolean } | null> {
  const held = await db
    .prepare(
      `SELECT g.id, g.account_id, g.title, g.status, g.target, g.markdown, g.created
         FROM claim c JOIN guide g ON g.id = c.guide_id
        WHERE c.agent_id = ?1 AND c.account_id = ?2 AND c.state = 'claimed'
        ORDER BY c.claimed_at LIMIT 1`,
    )
    .bind(who.agent, who.account)
    .first<TaskRow>();
  if (held) {
    const claim = await renew(db, held.id, who, { at, note: null });
    if (claim) return { task: held, claim, resumed: true };
  }

  const repo = repoKey(who.repo);
  const where = any ? "" : "AND g.target = ?2";
  const { results } = await db
    .prepare(
      `SELECT g.id, g.account_id, g.title, g.status, g.target, g.markdown, g.created
         FROM guide g
        WHERE g.kind = 'task' AND g.status = 'published' AND ${VISIBLE} ${where}
          AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.guide_id = g.id) AND NOT ${BLOCKED}
        ORDER BY g.created, g.id LIMIT 20`,
    )
    .bind(...(any ? [who.account] : [who.account, repo]))
    .all<TaskRow>();

  for (const task of results) {
    const lease = leaseFrom(at);
    const res = await db
      .prepare(
        `INSERT INTO claim (guide_id, account_id, agent_id, host, repo, worktree, state,
                            claimed_at, lease_until, updated)
         VALUES (?, ?, ?, ?, ?, ?, 'claimed', ?, ?, ?)
         ON CONFLICT(guide_id) DO NOTHING`,
      )
      .bind(
        task.id,
        who.account,
        who.agent,
        String(who.host || "").slice(0, 120),
        repo,
        String(who.worktree || "").slice(0, 400),
        at,
        lease,
        at,
      )
      .run();
    if (res.meta.changes === 1) {
      const claim = await claimOf(db, task.id);
      if (claim) return { task, claim, resumed: false };
    }
  }
  return null;
}

/** The claim on one task, or null. */
export function claimOf(db: D1Database, id: string): Promise<ClaimRow | null> {
  return db.prepare("SELECT * FROM claim WHERE guide_id = ?").bind(id).first<ClaimRow>();
}

/**
 * Word from the agent holding a task: the lease starts again, and `note` (when given) becomes the
 * line the board shows. Null when this agent does not hold this task — including when it once did
 * and a person has since released it, which is the answer an agent needs to stop working.
 *
 * A stalled claim renews like a live one. Stalled only means nobody heard from the agent in time;
 * the agent that took the task is still the one allowed to finish it.
 */
export async function renew(
  db: D1Database,
  id: string,
  who: Agent,
  { at, note }: { at: string; note: string | null },
): Promise<ClaimRow | null> {
  const res = await db
    .prepare(
      `UPDATE claim SET lease_until = ?, updated = ?, note = COALESCE(?, note)
        WHERE guide_id = ? AND agent_id = ? AND account_id = ? AND state = 'claimed'`,
    )
    .bind(
      leaseFrom(at),
      at,
      note === null ? null : note.trim().slice(0, NOTE_MAX),
      id,
      who.agent,
      who.account,
    )
    .run();
  return res.meta.changes === 1 ? claimOf(db, id) : null;
}

/**
 * The agent says it is done: the task moves to review with what it did attached.
 *
 * `report` is the transfer guide the agent wrote about the work, and it is required — a person
 * approving a task reads that against Acceptance, and "done" with nothing to read is the thing
 * the gate exists to catch. It has to be a guide this account wrote, and not a task.
 */
export async function finish(
  db: D1Database,
  id: string,
  who: Agent,
  { at, report, pr = "", note = "" }: { at: string; report: string; pr?: string; note?: string },
): Promise<{ claim: ClaimRow } | { error: string; status: 400 | 409 }> {
  const guide = await db
    .prepare("SELECT kind FROM guide WHERE id = ? AND account_id = ?")
    .bind(report, who.account)
    .first<{ kind: string }>();
  if (!guide)
    return {
      status: 400,
      error:
        "report must be the id of a transfer guide you published about this work — " +
        "publish_guide it first, then finish with its id",
    };
  if (guide.kind === "task")
    return { status: 400, error: "report is a task, not a transfer guide" };
  const res = await db
    .prepare(
      `UPDATE claim SET state = 'review', report_id = ?, pr = ?, note = COALESCE(NULLIF(?, ''), note), updated = ?
        WHERE guide_id = ? AND agent_id = ? AND account_id = ? AND state = 'claimed'`,
    )
    .bind(
      report,
      pr.trim().slice(0, 400),
      note.trim().slice(0, NOTE_MAX),
      at,
      id,
      who.agent,
      who.account,
    )
    .run();
  if (res.meta.changes !== 1)
    return {
      status: 409,
      error: "this agent does not hold that task — it was released, or never taken here",
    };
  const claim = await claimOf(db, id);
  return claim ? { claim } : { status: 409, error: "the claim went away while finishing" };
}

/** Every task this account can see, with its column and its claim. Oldest first. */
export async function list(
  db: D1Database,
  account: string,
  at: string,
): Promise<
  {
    task: Omit<TaskRow, "markdown"> & { share_key: string };
    claim: ClaimRow | null;
    state: TaskState;
    report_title: string;
    report_key: string;
  }[]
> {
  const [tasks, claims] = await Promise.all([
    db
      .prepare(
        `SELECT g.id, g.account_id, g.title, g.status, g.target, g.created, g.share_key,
                ${BLOCKED} AS blocked
           FROM guide g WHERE g.kind = 'task' AND ${VISIBLE} ORDER BY g.created, g.id LIMIT 200`,
      )
      .bind(account)
      .all<Omit<TaskRow, "markdown"> & { share_key: string; blocked: number }>(),
    db
      .prepare(
        // The write-up's title rides along, so a reviewer scanning the board sees what came back
        // without opening it. Only a guide the same account can see is named.
        `SELECT c.*, COALESCE(r.title, '') AS report_title, COALESCE(r.share_key, '') AS report_key
           FROM claim c
           JOIN guide g ON g.id = c.guide_id
           LEFT JOIN guide r ON r.id = c.report_id AND r.account_id = c.account_id
          WHERE g.kind = 'task' AND ${VISIBLE}`,
      )
      .bind(account)
      .all<ClaimRow & { report_title: string; report_key: string }>(),
  ]);
  const byTask = new Map(claims.results.map((c) => [c.guide_id, c]));
  return tasks.results.map((task) => {
    const claim = byTask.get(task.id) || null;
    return {
      task,
      claim,
      state: stateOf(task, claim, at),
      report_title: claim?.report_title || "",
      report_key: claim?.report_key || "",
    };
  });
}

/**
 * A task this account wrote, with its claim, or a refusal. The gate is the author's: approving,
 * rejecting and releasing all decide what happens to work somebody asked for, and only they asked.
 */
async function authored(
  db: D1Database,
  id: string,
  account: string,
): Promise<{ markdown: string; claim: ClaimRow | null } | { error: string; status: 404 }> {
  const g = await db
    .prepare("SELECT markdown FROM guide WHERE id = ? AND account_id = ? AND kind = 'task'")
    .bind(id, account)
    .first<{ markdown: string }>();
  if (!g)
    return {
      status: 404,
      error: "no such task of yours — only its author decides what happens to it",
    };
  return { markdown: g.markdown, claim: await claimOf(db, id) };
}

/** Set `status:` in a document's frontmatter, so the markdown agrees with the column. */
const withStatus = (markdown: string, status: string) =>
  markdown.replace(/^(---\r?\n[\s\S]*?^)status:[^\n]*$/m, `$1status: ${status}`);

/**
 * The author accepts the work: a task in review is done. Done is the guide's `consumed`, the
 * status every other finished guide already uses, so it leaves the board and the free tier's
 * count the same way.
 */
export async function approve(
  db: D1Database,
  id: string,
  { account, at }: { account: string; at: string },
): Promise<{ state: "done"; claimant: string } | { error: string; status: 404 | 409 }> {
  const t = await authored(db, id, account);
  if ("error" in t) return t;
  if (t.claim?.state !== "review")
    return { status: 409, error: "only a task in review can be approved — nobody has finished it" };
  await db
    .prepare("UPDATE guide SET status = 'consumed', markdown = ?, updated = ? WHERE id = ?")
    .bind(withStatus(t.markdown, "consumed"), at, id)
    .run();
  return { state: "done", claimant: t.claim.account_id };
}

/**
 * A line added to the end of a task, under `## Review notes`, which the next agent reads with the
 * rest of it. The section is made the first time and kept last, so each note goes on its end.
 */
function withNote(markdown: string, line: string): string {
  const body = markdown.trimEnd();
  const lastHeading = body.match(/^## .*$/gm)?.pop();
  const head = lastHeading === "## Review notes" ? body : `${body}\n\n## Review notes`;
  return `${head}\n- ${line}\n`;
}

/**
 * The author turns the work down: the task goes back to Ready with the reason on it, and the
 * claim is gone, so any agent may take it next — including the one that just had it. The reason
 * is required and it goes into the task itself, because the next agent learns what was wrong from
 * the document it is handed, not from a note somewhere it will never look.
 */
export async function reject(
  db: D1Database,
  id: string,
  { account, at, why }: { account: string; at: string; why: string },
): Promise<{ state: "ready"; claimant: string } | { error: string; status: 400 | 404 | 409 }> {
  const reason = String(why ?? "")
    .trim()
    .slice(0, 1000);
  if (!reason)
    return { status: 400, error: "say why: the next agent reads it before starting again" };
  const t = await authored(db, id, account);
  if ("error" in t) return t;
  if (t.claim?.state !== "review")
    return { status: 409, error: "only a task in review can be rejected — nobody has finished it" };
  const markdown = withNote(t.markdown, `${at.slice(0, 10)} rejected: ${reason}`);
  await db.batch([
    db.prepare("DELETE FROM claim WHERE guide_id = ?").bind(id),
    db.prepare("UPDATE guide SET markdown = ?, updated = ? WHERE id = ?").bind(markdown, at, id),
  ]);
  return { state: "ready", claimant: t.claim.account_id };
}

/**
 * The author takes a task back from the agent holding it, live or stalled: it goes back to Ready,
 * and any agent may take it next. The agent that had it hears on its next call that it no longer
 * holds it, and stops.
 *
 * What that agent left behind is often half the job, in a worktree on some machine. So the task
 * says where — host, worktree and its last progress line — and the next agent can go and look
 * rather than start from nothing.
 */
export async function release(
  db: D1Database,
  id: string,
  { account, at }: { account: string; at: string },
): Promise<{ state: "ready"; claimant: string } | { error: string; status: 404 | 409 }> {
  const t = await authored(db, id, account);
  if ("error" in t) return t;
  const c = t.claim;
  if (c?.state !== "claimed")
    return {
      status: 409,
      error: c ? "this task is in review — approve or reject it instead" : "nobody holds this task",
    };
  const where = [c.host, c.worktree].filter(Boolean).join(":") || `agent ${c.agent_id}`;
  const said = c.note ? `; last progress: "${c.note}"` : "";
  const markdown = withNote(t.markdown, `${at.slice(0, 10)} released from ${where}${said}`);
  await db.batch([
    db.prepare("DELETE FROM claim WHERE guide_id = ?").bind(id),
    db.prepare("UPDATE guide SET markdown = ?, updated = ? WHERE id = ?").bind(markdown, at, id),
  ]);
  return { state: "ready", claimant: c.account_id };
}

/**
 * Set what a task waits for, replacing whatever it waited for before. Returns the ids kept.
 *
 * Only tasks the author can see are kept, and never the task itself: naming someone else's task
 * would let a stranger's queue decide when yours moves, and a task blocked by itself never moves.
 * Anything else is dropped rather than refused, the way an unresolvable `parent:` is — a
 * `blocked_by:` written against a task that was since deleted should not make the document
 * unpublishable by its own author.
 */
export async function blockOn(
  db: D1Database,
  id: string,
  ids: string[],
  { account }: { account: string },
): Promise<string[]> {
  const wanted = [...new Set(ids.map(String))].filter((b) => b && b !== id).slice(0, 50);
  const kept: string[] = [];
  for (const b of wanted) {
    const ok = await db
      .prepare(`SELECT 1 FROM guide g WHERE g.id = ?2 AND g.kind = 'task' AND ${VISIBLE}`)
      .bind(account, b)
      .first();
    if (ok) kept.push(b);
  }
  await db.batch([
    db.prepare("DELETE FROM task_block WHERE guide_id = ?").bind(id),
    ...kept.map((b) =>
      db.prepare("INSERT INTO task_block (guide_id, blocker_id) VALUES (?, ?)").bind(id, b),
    ),
  ]);
  return kept;
}
