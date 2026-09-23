/**
 * Guides an agent can take: the queue, the claim, the lease. See docs/V2.md and
 * migrations/0021_claims.sql and 0024_claim_place.sql.
 *
 * The one rule this module exists to keep: no two agents ever hold the same work in the same place.
 * A task has one place, so one taker; a handoff can be repeated once in each repo. The claim's
 * primary key is the lock, and a lease that runs out does not release it — a card whose agent
 * went quiet is `stalled`, still locked, until a person releases it or the same agent comes back.
 *
 * Imports no sibling `.ts` on purpose, like billing.ts: it is tested against a real SQLite with
 * the real migrations, and a value import of a sibling is what Node's type stripping cannot follow.
 */

/** How long a claim holds without word from its agent. Every progress call starts it again. */
export const LEASE_MS = 30 * 60 * 1000;

/**
 * How long a person's hold lasts. A person taking a handoff in the browser does not report
 * progress every half hour the way an agent does, and "went quiet" after thirty minutes would be
 * a lie about somebody who is simply working. A week, then it reads as stalled like anything else.
 */
export const PERSON_LEASE_MS = 7 * 24 * 60 * 60 * 1000;

/** The longest progress line kept. It is a status, not a log. */
export const NOTE_MAX = 280;

/** The longest evidence kept. A note is a line; this is a paste of output, so it gets room. */
export const EVIDENCE_MAX = 4000;

/**
 * What a hand-in has to bring, in the words an agent is refused with. See docs/V2.md §11.
 *
 * "Done" is the agent's word for its own work, and a write-up is the agent's word written longer.
 * Neither tells the person at the gate what actually ran. Evidence is the other side of that: the
 * command and what came back, a test summary, a link to the change, a screenshot url.
 *
 * The rule is deliberately one rule — something was sent, and it is longer than a verdict — rather
 * than a parser that decides what real output looks like. Anything cleverer refuses honest evidence
 * in a shape nobody thought of, and the refusal itself is what teaches: it says what counts.
 */
export function evidenceProblem(text: string): string | null {
  const said = String(text ?? "").trim();
  if (said.length >= 16) return null;
  return (
    "send `evidence`: what you ran and what came back — the command and the lines that decided " +
    "it, a test summary, a link to the change, or a screenshot url. " +
    `"${said || "nothing"}" is a claim, not evidence.`
  );
}

/**
 * Where a task is, as a column name. Derived from the guide and its claim on every read, never
 * stored: `stalled` in particular is only "claimed, and the lease is in the past", and storing it
 * would need something running on a clock to write it.
 */
export type TaskState = "draft" | "ready" | "blocked" | "claimed" | "stalled" | "review" | "done";

/** One Acceptance line, and what the agent ran for it. See migrations/0028_evidence_checks.sql. */
export interface Check {
  check: string;
  ran: string;
}

/**
 * Evidence sorted against the lines it answers, or the reason it is not evidence yet.
 *
 * The same rule as evidenceProblem(), applied per line, plus the line itself: "it works" under an
 * Acceptance line is the same claim it always was, just filed more neatly.
 */
export function checksProblem(checks: Check[]): string | null {
  for (const c of checks) {
    if (!String(c?.check ?? "").trim())
      return "each entry needs `check`: which check it is evidence for, in the task's own words";
    const bad = evidenceProblem(c?.ran ?? "");
    if (bad) return `for "${String(c.check).trim().slice(0, 60)}", ${bad}`;
  }
  return null;
}

/** The checks as one block of text, which is what every surface that predates them reads. */
export const flatten = (checks: Check[]): string =>
  checks.map((c) => `${c.check.trim()}\n${c.ran.trim()}`).join("\n\n");

export interface ClaimRow {
  guide_id: string;
  /** The lock's second half: '' for a task, the taker's repo for anything else. */
  place: string;
  account_id: string;
  agent_id: string;
  host: string;
  repo: string;
  worktree: string;
  state: string;
  note: string;
  /** What the agent ran and what came back, sent with the hand-in. Empty until it hands in. */
  evidence: string;
  /** The same evidence against the lines it answers, as JSON. Empty when it was sent as one block. */
  checks: string;
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
  /** Take a task from outside the repo it is for. */
  any?: boolean;
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

const leaseFrom = (at: string, ms = LEASE_MS) => new Date(Date.parse(at) + ms).toISOString();

// A task the account may see: its own, or one shared to a team it is in.
const VISIBLE = `(g.account_id = ?1 OR (g.team_id <> '' AND g.team_id IN
  (SELECT team_id FROM membership WHERE account_id = ?1)))`;

// Addressed to this account, or to nobody in particular: a task assigned to one person or to one
// group is theirs to take, and the queue does not hand it to anyone else's agent.
const FOR_ME = `(g.to_account_id = '' OR g.to_account_id = ?1) AND (g.to_group_id = '' OR
  g.to_group_id IN (SELECT group_id FROM group_member WHERE account_id = ?1))`;

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
        WHERE g.kind = 'task' AND g.status = 'published' AND ${VISIBLE} AND ${FOR_ME} ${where}
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
         ON CONFLICT(guide_id, place) DO NOTHING`,
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
      const claim = await claimFor(db, task.id, who);
      if (claim) return { task, claim, resumed: false };
    }
  }
  return null;
}

/** The claim on one task, or null. A task has one place, so at most one claim. */
export function claimOf(db: D1Database, id: string): Promise<ClaimRow | null> {
  return db
    .prepare("SELECT * FROM claim WHERE guide_id = ? AND place = ''")
    .bind(id)
    .first<ClaimRow>();
}

/** This agent's claim on a guide, of any kind, or null. */
function claimFor(db: D1Database, id: string, who: Agent): Promise<ClaimRow | null> {
  return db
    .prepare("SELECT * FROM claim WHERE guide_id = ? AND agent_id = ? AND account_id = ?")
    .bind(id, who.agent, who.account)
    .first<ClaimRow>();
}

type Refusal = { error: string; status: 400 | 404 | 409; holder?: ClaimRow };

/**
 * This agent takes one guide, of any kind, by id: "I am doing this". The same lock as `next`.
 *
 * A task is taken once, wherever the agent is, and only from the repo it is for unless `any`. A
 * handoff or a bug is taken once per repo: the place is the agent's repo, so a transfer handed to a
 * team can be repeated in each teammate's checkout and never twice in one. A refusal because
 * somebody has it names who, so the agent can say so instead of silently doubling the work.
 *
 * An agent holds one thing at a time, as with `next`: taking what it already holds renews it, and
 * taking something else while it holds one is refused with the id it has to finish or pass first.
 */
export async function take(
  db: D1Database,
  id: string,
  who: Agent,
  {
    at,
    many = false,
    leaseMs = LEASE_MS,
  }: {
    at: string;
    /** A person, not an agent: they may hold several things at once. */
    many?: boolean;
    leaseMs?: number;
  },
): Promise<{ task: TaskRow & { kind: string }; claim: ClaimRow; resumed: boolean } | Refusal> {
  const g = await db
    .prepare(
      `SELECT g.id, g.account_id, g.title, g.status, g.target, g.markdown, g.created, g.kind,
              g.to_account_id, ${BLOCKED} AS blocked, ${FOR_ME} AS for_me
         FROM guide g WHERE g.id = ?2 AND ${VISIBLE}`,
    )
    .bind(who.account, id)
    .first<TaskRow & { kind: string; to_account_id: string; blocked: number; for_me: number }>();
  if (!g) return { status: 404, error: "no such guide that you can see" };

  const held = await db
    .prepare(
      many
        ? "SELECT guide_id FROM claim WHERE agent_id = ? AND account_id = ? AND state = 'claimed' AND guide_id = ?"
        : "SELECT guide_id FROM claim WHERE agent_id = ? AND account_id = ? AND state = 'claimed' ORDER BY guide_id = ? DESC LIMIT 1",
    )
    .bind(who.agent, who.account, id)
    .first<{ guide_id: string }>();
  if (held?.guide_id === id) {
    const claim = await renew(db, id, who, { at, note: null });
    if (claim) return { task: g, claim, resumed: true };
  }
  if (held)
    return {
      status: 409,
      error: `this agent already holds ${held.guide_id}: hand it in or pass it before taking another`,
    };

  if (g.status !== "published")
    return {
      status: 409,
      error: `${id} is not open to take: it is ${g.status === "draft" ? "a draft" : "done"}`,
    };
  const task = g.kind === "task";
  if (task && !g.for_me)
    return { status: 409, error: `${id} is assigned to someone else — its author can reassign it` };
  if (task && g.blocked)
    return { status: 409, error: `${id} waits for tasks nobody has approved yet` };
  const repo = repoKey(who.repo);
  if (task && !who.any && g.target !== repo)
    return {
      status: 400,
      error: `${id} is for ${g.target || "no repo"}, and this agent is in ${repo || "no repo"}`,
    };

  // A handoff sent to a team or a group asks one of them. When a teammate has already said it
  // worked, taking it again is doing the same work twice — the regression waiting to happen — so
  // it is refused with who did it. Asked of you by name, it is yours to repeat regardless.
  if (!task && g.to_account_id !== who.account) {
    const done = await db
      .prepare(
        `SELECT COALESCE(NULLIF(a.name, ''), '@' || NULLIF(a.handle, ''), 'a teammate') AS who, v.at
           FROM verdict v JOIN account a ON a.id = v.account_id
          WHERE v.guide_id = ? AND v.ok = 1 AND v.account_id <> ? ORDER BY v.at DESC LIMIT 1`,
      )
      .bind(id, who.account)
      .first<{ who: string; at: string }>();
    if (done)
      return {
        status: 409,
        error:
          `${done.who} already said it worked (${done.at.slice(0, 10)}), so it is not waiting on ` +
          "anyone. Tell the user before doing it again; get_guide reads it without taking it.",
      };
  }

  const place = task ? "" : repo;
  const res = await db
    .prepare(
      `INSERT INTO claim (guide_id, place, account_id, agent_id, host, repo, worktree, state,
                          claimed_at, lease_until, updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'claimed', ?, ?, ?)
       ON CONFLICT(guide_id, place) DO NOTHING`,
    )
    .bind(
      id,
      place,
      who.account,
      who.agent,
      String(who.host || "").slice(0, 120),
      repo,
      String(who.worktree || "").slice(0, 400),
      at,
      leaseFrom(at, leaseMs),
      at,
    )
    .run();
  if (res.meta.changes === 1) {
    const claim = await claimFor(db, id, who);
    if (claim) return { task: g, claim, resumed: false };
  }
  const holder = await db
    .prepare("SELECT * FROM claim WHERE guide_id = ? AND place = ?")
    .bind(id, place)
    .first<ClaimRow>();
  const where = [holder?.host, holder?.worktree].filter(Boolean).join(":");
  return {
    status: 409,
    holder: holder || undefined,
    error: `${id} is already taken${place ? ` in ${place}` : ""}${where ? ` by the agent at ${where}` : ""}`,
  };
}

/** Where a held guide is: live, or stalled because its agent went quiet. */
export type HeldState = "claimed" | "stalled";

/**
 * Everything somebody is working on right now that this account can see, of every kind: who has
 * it, where, what they last said. Handed-in work is not here — it is waiting on a person, not being
 * worked on. Most recently heard from first.
 */
export async function working(
  db: D1Database,
  account: string,
  at: string,
): Promise<
  {
    guide: {
      id: string;
      title: string;
      kind: string;
      target: string;
      share_key: string;
      account_id: string;
    };
    claim: ClaimRow;
    state: HeldState;
    by: { handle: string; name: string; you: boolean };
  }[]
> {
  const { results } = await db
    .prepare(
      `SELECT c.*, g.title AS g_title, g.kind AS g_kind, g.target AS g_target,
              g.share_key AS g_share_key, g.account_id AS g_account,
              COALESCE(a.handle, '') AS by_handle, COALESCE(a.name, '') AS by_name
         FROM claim c
         JOIN guide g ON g.id = c.guide_id
         LEFT JOIN account a ON a.id = c.account_id
        WHERE c.state = 'claimed' AND ${VISIBLE}
        ORDER BY c.lease_until DESC LIMIT 200`,
    )
    .bind(account)
    .all<
      ClaimRow & {
        g_title: string;
        g_kind: string;
        g_target: string;
        g_share_key: string;
        g_account: string;
        by_handle: string;
        by_name: string;
      }
    >();
  return results.map(
    ({ g_title, g_kind, g_target, g_share_key, g_account, by_handle, by_name, ...claim }) => ({
      guide: {
        id: claim.guide_id,
        title: g_title,
        kind: g_kind,
        target: g_target,
        share_key: g_share_key,
        account_id: g_account,
      },
      claim,
      state: claim.lease_until > at ? "claimed" : "stalled",
      by: { handle: by_handle, name: by_name, you: claim.account_id === account },
    }),
  );
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
  return res.meta.changes === 1 ? claimFor(db, id, who) : null;
}

/**
 * The agent says it is done: the task moves to review with what it did attached.
 *
 * `report` is the transfer guide the agent wrote about the work, and it is required — a person
 * approving a task reads that against Acceptance, and "done" with nothing to read is the thing
 * the gate exists to catch. It has to be a guide this account wrote, and not a task.
 *
 * `evidence` is required for the same reason one step further on: the write-up is still the agent
 * describing its own work, and the reviewer has no way to tell a run that happened from one that
 * was summarised. See evidenceProblem().
 */
export async function finish(
  db: D1Database,
  id: string,
  who: Agent,
  {
    at,
    report,
    evidence,
    checks = [],
    pr = "",
    note = "",
  }: {
    at: string;
    report: string;
    evidence: string;
    /** Evidence against each line the task asked for. The better shape, and not the only one. */
    checks?: Check[];
    pr?: string;
    note?: string;
  },
): Promise<{ claim: ClaimRow } | { error: string; status: 400 | 409 }> {
  // Checks are evidence, so a hand-in that brings them has brought it: `evidence` is filled from
  // them rather than asked for twice.
  const said = checks.length ? flatten(checks) : evidence;
  const bad = checks.length ? checksProblem(checks) : evidenceProblem(evidence);
  if (bad) return { status: 400, error: bad };
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
      `UPDATE claim SET state = 'review', report_id = ?, pr = ?, evidence = ?, checks = ?,
              note = COALESCE(NULLIF(?, ''), note), updated = ?
        WHERE guide_id = ? AND agent_id = ? AND account_id = ? AND state = 'claimed'`,
    )
    .bind(
      report,
      pr.trim().slice(0, 400),
      said.trim().slice(0, EVIDENCE_MAX),
      checks.length
        ? JSON.stringify(
            checks.map((c) => ({
              check: c.check.trim().slice(0, NOTE_MAX),
              ran: c.ran.trim().slice(0, EVIDENCE_MAX),
            })),
          ).slice(0, EVIDENCE_MAX * 2)
        : "",
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
  const claim = await claimFor(db, id, who);
  return claim ? { claim } : { status: 409, error: "the claim went away while finishing" };
}

/** Every task this account can see, with its column and its claim. Oldest first. */
export async function list(
  db: D1Database,
  account: string,
  at: string,
): Promise<
  {
    task: Omit<TaskRow, "markdown"> & {
      share_key: string;
      for_me: number;
      team_slug: string;
      to_handle: string;
      to_group_slug: string;
    };
    claim: ClaimRow | null;
    state: TaskState;
    report_title: string;
    report_key: string;
    /** Whose agent has it: a teammate's agent can take your task. Null until one does. */
    by: { handle: string; name: string; you: boolean } | null;
  }[]
> {
  const [tasks, claims] = await Promise.all([
    db
      .prepare(
        `SELECT g.id, g.account_id, g.title, g.status, g.target, g.created, g.share_key,
                ${BLOCKED} AS blocked, COALESCE(t.slug, '') AS team_slug,
                (g.to_account_id = ?1 OR (g.to_group_id <> '' AND g.to_group_id IN
                  (SELECT group_id FROM group_member WHERE account_id = ?1))) AS for_me,
                COALESCE(ta.handle, '') AS to_handle, COALESCE(tg.slug, '') AS to_group_slug
           FROM guide g
           LEFT JOIN team t ON t.id = g.team_id
           LEFT JOIN account ta ON ta.id = g.to_account_id AND g.to_account_id <> ''
           LEFT JOIN team_group tg ON tg.id = g.to_group_id AND g.to_group_id <> ''
          WHERE g.kind = 'task' AND ${VISIBLE} ORDER BY g.created, g.id LIMIT 200`,
      )
      .bind(account)
      .all<
        Omit<TaskRow, "markdown"> & {
          share_key: string;
          blocked: number;
          for_me: number;
          team_slug: string;
          to_handle: string;
          to_group_slug: string;
        }
      >(),
    db
      .prepare(
        // The write-up's title rides along, so a reviewer scanning the board sees what came back
        // without opening it. Only a guide the same account can see is named.
        `SELECT c.*, COALESCE(r.title, '') AS report_title, COALESCE(r.share_key, '') AS report_key,
                COALESCE(a.handle, '') AS by_handle, COALESCE(a.name, '') AS by_name
           FROM claim c
           JOIN guide g ON g.id = c.guide_id
           LEFT JOIN account a ON a.id = c.account_id
           LEFT JOIN guide r ON r.id = c.report_id AND r.account_id = c.account_id
          WHERE g.kind = 'task' AND ${VISIBLE}`,
      )
      .bind(account)
      .all<
        ClaimRow & { report_title: string; report_key: string; by_handle: string; by_name: string }
      >(),
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
      by: claim
        ? { handle: claim.by_handle, name: claim.by_name, you: claim.account_id === account }
        : null,
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
  // Continuation lines are indented so a reason over several lines stays inside its one bullet:
  // unindented, the second line reads as loose text and the next note opens a second list.
  const item = line
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .join("\n  ");
  return `${head}\n- ${item}\n`;
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

/**
 * The agent gives back what it holds: "not me", with the reason. Its claim goes, so the work is
 * open again in that place and the agent is free to take something else.
 *
 * On a task the reason goes into the task under `## Review notes`, with where the agent was, like
 * a release does: the next agent is handed the document, and that is the only place it will look.
 * On anything else the author hears it through the route's own notification.
 */
export async function pass(
  db: D1Database,
  id: string,
  who: Agent,
  { at, why }: { at: string; why: string },
): Promise<{ kind: string; author: string } | { error: string; status: 400 | 409 }> {
  const reason = String(why ?? "")
    .trim()
    .slice(0, 1000);
  if (!reason)
    return { status: 400, error: "say why you are passing it, so whoever is next knows" };
  const c = await claimFor(db, id, who);
  const g = await db
    .prepare("SELECT kind, account_id, markdown FROM guide WHERE id = ?")
    .bind(id)
    .first<{ kind: string; account_id: string; markdown: string }>();
  if (!c || c.state !== "claimed" || !g)
    return { status: 409, error: "this agent does not hold that — there is nothing to pass" };
  const drop = db
    .prepare("DELETE FROM claim WHERE guide_id = ? AND place = ? AND agent_id = ?")
    .bind(id, c.place, who.agent);
  if (g.kind === "task") {
    const where = [c.host, c.worktree].filter(Boolean).join(":") || `agent ${c.agent_id}`;
    const markdown = withNote(g.markdown, `${at.slice(0, 10)} passed from ${where}: ${reason}`);
    await db.batch([
      drop,
      db.prepare("UPDATE guide SET markdown = ?, updated = ? WHERE id = ?").bind(markdown, at, id),
    ]);
  } else await drop.run();
  return { kind: g.kind, author: g.account_id };
}

/**
 * The agent hands in a handoff or a bug it took: done here, waiting on its author. The claim stays,
 * as `review`, so it leaves `working()` and the author can see who did it and where. A task hands
 * in through `finish`, which needs the write-up the gate reads.
 *
 * `evidence` is required here as it is there: "it worked" from the agent that did the work is the
 * one thing the author cannot check. The exception is a person handing in from the browser, who is
 * not pasting a terminal into a page — that path passes `person: true` and is taken at their word,
 * for the same reason the hub has no forms.
 */
export async function handIn(
  db: D1Database,
  id: string,
  who: Agent,
  {
    at,
    note,
    evidence,
    person = false,
  }: { at: string; note: string; evidence: string; person?: boolean },
): Promise<{ claim: ClaimRow } | { error: string; status: 400 | 409 }> {
  const bad = person ? null : evidenceProblem(evidence);
  if (bad) return { status: 400, error: bad };
  const res = await db
    .prepare(
      `UPDATE claim SET state = 'review', evidence = ?, note = COALESCE(NULLIF(?, ''), note), updated = ?
        WHERE guide_id = ? AND agent_id = ? AND account_id = ? AND state = 'claimed'`,
    )
    .bind(
      String(evidence ?? "")
        .trim()
        .slice(0, EVIDENCE_MAX),
      String(note ?? "")
        .trim()
        .slice(0, NOTE_MAX),
      at,
      id,
      who.agent,
      who.account,
    )
    .run();
  const claim = res.meta.changes === 1 ? await claimFor(db, id, who) : null;
  return claim
    ? { claim }
    : { status: 409, error: "this agent does not hold that — take it first, or it was taken back" };
}

/** One call worth making next, when to make it, and what it has to carry. */
export interface Step {
  tool: "take" | "progress" | "hand_in" | "pass";
  when: string;
  why: string;
  /** What the call needs, named on every answer so it is in front of the agent when it calls. */
  with?: string;
}

/** What just happened, from the agent's side. */
export type StepEvent = "taken" | "progress" | "handed_in" | "passed" | "nothing" | "not_held";

/**
 * What an agent should do next, attached to every answer it gets. See docs/V2.md §11.
 *
 * Instructions an agent read at the start of a long session are the first thing it forgets; the
 * answer to the call it just made is the last thing it read. So the next move rides on that answer,
 * worked out here because only the server knows the state. `say` is set when the right move is to
 * make no call at all: stop, or tell the person.
 */
export function steps(kind: string, event: StepEvent): { next: Step[]; say?: string } {
  const done =
    kind === "task"
      ? "every line of Acceptance holds"
      : "you ran its Verification here, and it holds or it does not";
  const working: Step[] = [
    {
      tool: "progress",
      when: "at each milestone, with a one-line note",
      why: "30 minutes without word marks it stalled",
    },
    {
      tool: "hand_in",
      when: done,
      why:
        kind === "task"
          ? "its author reviews your write-up against Acceptance"
          : "its author hears whether it worked",
      // Said on every answer, not only once at take: by the time an agent finishes a long piece
      // of work, the rules it read at the start are the first thing gone. Keep evidence collected
      // as you go, or you are reconstructing it from memory at the end, which is the failure this
      // is here to stop.
      with:
        kind === "task"
          ? "checks: one entry per Acceptance line — that line, and what you ran for it. Its " +
            "author reads them line against line, so evidence filed under the check it answers is " +
            "worth more than the same output in one block. Keep it as you go."
          : "evidence: what you ran and what came back — the command and the lines that decided " +
            "it, a test summary, a link to the change, or a screenshot url. Keep it as you go.",
    },
    {
      tool: "pass",
      when: "it is not yours to do, or you are stuck",
      why: "with the reason, so whoever is next knows",
    },
  ];
  const again: Step[] = [
    { tool: "take", when: "now, with no id", why: "the next thing waiting for this agent" },
  ];
  switch (event) {
    case "taken":
    case "progress":
      return { next: working };
    case "handed_in":
    case "passed":
      return { next: again };
    case "nothing":
      return {
        next: [],
        say: "Nothing is waiting for this agent here. Tell the person, and stop.",
      };
    case "not_held":
      return { next: [], say: "You no longer hold this. Stop working on it, and tell the person." };
  }
}

/**
 * Handoffs and bugs this account wrote that somebody handed in, waiting on the author to close.
 * One row per hand-in: a handoff repeated in two repos is two. Tasks are not here; their gate is
 * approve and reject, from the task list.
 */
export async function handedIn(
  db: D1Database,
  account: string,
): Promise<
  {
    guide: { id: string; title: string; kind: string; share_key: string };
    claim: ClaimRow;
    by: { handle: string; name: string };
  }[]
> {
  const { results } = await db
    .prepare(
      `SELECT c.*, g.title AS g_title, g.kind AS g_kind, g.share_key AS g_share_key,
              COALESCE(a.handle, '') AS by_handle, COALESCE(a.name, '') AS by_name
         FROM claim c
         JOIN guide g ON g.id = c.guide_id
         LEFT JOIN account a ON a.id = c.account_id
        WHERE c.state = 'review' AND g.kind <> 'task' AND g.account_id = ?
        ORDER BY c.updated DESC LIMIT 100`,
    )
    .bind(account)
    .all<
      ClaimRow & {
        g_title: string;
        g_kind: string;
        g_share_key: string;
        by_handle: string;
        by_name: string;
      }
    >();
  return results.map(({ g_title, g_kind, g_share_key, by_handle, by_name, ...claim }) => ({
    guide: { id: claim.guide_id, title: g_title, kind: g_kind, share_key: g_share_key },
    claim,
    by: { handle: by_handle, name: by_name },
  }));
}

/** A handoff or bug this account wrote, with its markdown, or a refusal. */
async function authoredGuide(
  db: D1Database,
  id: string,
  account: string,
): Promise<{ markdown: string } | { error: string; status: 404 }> {
  const g = await db
    .prepare("SELECT markdown FROM guide WHERE id = ? AND account_id = ? AND kind <> 'task'")
    .bind(id, account)
    .first<{ markdown: string }>();
  return g || { status: 404, error: "no such guide of yours — only its author closes it" };
}

/**
 * The author accepts what was handed in: the guide is done, the way an approved task is — archived
 * as `consumed` — and every claim on it goes, handed in or not. Returns who had it, to tell them.
 */
export async function closeHandedIn(
  db: D1Database,
  id: string,
  { account, at }: { account: string; at: string },
): Promise<{ claimants: string[] } | { error: string; status: 404 }> {
  const g = await authoredGuide(db, id, account);
  if ("error" in g) return g;
  const { results } = await db
    .prepare("SELECT DISTINCT account_id FROM claim WHERE guide_id = ?")
    .bind(id)
    .all<{ account_id: string }>();
  await db.batch([
    db.prepare("DELETE FROM claim WHERE guide_id = ?").bind(id),
    db
      .prepare("UPDATE guide SET status = 'consumed', markdown = ?, updated = ? WHERE id = ?")
      .bind(withStatus(g.markdown, "consumed"), at, id),
  ]);
  return { claimants: results.map((r) => r.account_id) };
}

/**
 * The author turns one hand-in down: that repo's claim goes, so the handoff is open there again,
 * and the reason goes to whoever handed it in. The reason is required, as it is for a task.
 */
export async function sendBackHandedIn(
  db: D1Database,
  id: string,
  { account, place, why }: { account: string; at: string; place: string; why: string },
): Promise<{ claimant: string } | { error: string; status: 400 | 404 | 409 }> {
  if (!String(why ?? "").trim())
    return { status: 400, error: "say why: whoever takes it next should know what was missing" };
  const g = await authoredGuide(db, id, account);
  if ("error" in g) return g;
  const c = await db
    .prepare("SELECT account_id FROM claim WHERE guide_id = ? AND place = ? AND state = 'review'")
    .bind(id, place)
    .first<{ account_id: string }>();
  if (!c) return { status: 409, error: "nothing handed in there to send back" };
  await db.prepare("DELETE FROM claim WHERE guide_id = ? AND place = ?").bind(id, place).run();
  return { claimant: c.account_id };
}

/**
 * After a reassignment: take the work back from everyone the new assignment leaves out. `accounts`
 * is who may hold it now — a person, or a group's members — and null means the whole team, which
 * leaves nobody out. Only live claims go; something already handed in waits on its author either
 * way. On a task the reason goes under `## Review notes` with where it was, so the next agent can
 * pick up what was started. Returns the accounts whose hold was dropped, to tell them.
 */
export async function dropOutside(
  db: D1Database,
  id: string,
  { accounts, at, why }: { accounts: string[] | null; at: string; why: string },
): Promise<string[]> {
  if (accounts === null) return [];
  const { results } = await db
    .prepare("SELECT * FROM claim WHERE guide_id = ? AND state = 'claimed'")
    .bind(id)
    .all<ClaimRow>();
  const out = results.filter((c) => !accounts.includes(c.account_id));
  if (!out.length) return [];
  const g = await db
    .prepare("SELECT kind, markdown FROM guide WHERE id = ?")
    .bind(id)
    .first<{ kind: string; markdown: string }>();
  const drops = out.map((c) =>
    db.prepare("DELETE FROM claim WHERE guide_id = ? AND place = ?").bind(id, c.place),
  );
  if (g?.kind === "task") {
    const c = out[0]!;
    const where = [c.host, c.worktree].filter(Boolean).join(":") || `agent ${c.agent_id}`;
    const markdown = withNote(g.markdown, `${at.slice(0, 10)} ${why}; it was with ${where}`);
    drops.push(
      db.prepare("UPDATE guide SET markdown = ?, updated = ? WHERE id = ?").bind(markdown, at, id),
    );
  }
  await db.batch(drops);
  return [...new Set(out.map((c) => c.account_id))];
}
