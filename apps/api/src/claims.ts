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

/**
 * The claim-holder a person is when they take something in the browser, rather than an agent.
 *
 * A person and their own agent are one party to a handoff. Saying "I'll do this" in the hub holds
 * it as the person; their agent then taking it in a repo is the same work arriving somewhere, so
 * that hold gives way to the agent's rather than standing beside it — two holds for one worker
 * showed a guide as handed in and still being worked on, by the same name, at once.
 */
export const personAgent = (account: string) =>
  `person-${account.toLowerCase().replace(/[^a-z0-9-]/g, "")}`;
const isPerson = (agent: string) => agent.startsWith("person-");

/** Let go of this account's browser hold on a guide, now that its own agent has it somewhere. */
function dropPersonHold(db: D1Database, id: string, account: string) {
  return db
    .prepare(
      "DELETE FROM claim WHERE guide_id = ? AND place = '' AND account_id = ? AND agent_id = ? AND state = 'claimed'",
    )
    .bind(id, account, personAgent(account))
    .run();
}

/** The longest progress line kept. It is a status, not a log. */
export const NOTE_MAX = 280;

/**
 * The longest question or reply kept. A note is a line on a board; a question that has to carry its
 * own context, and the answer to it, are allowed a few sentences. Plain text: nothing renders it as
 * anything else.
 */
export const MESSAGE_MAX = 1000;

/**
 * How long a claim holds while its agent is waiting on a person. A person can take hours to answer,
 * and an agent that stopped because it was told to is not "went quiet". It is still a lease and not a
 * release: nobody else can take the work, and a question nobody answers for a day reads as stalled
 * like anything else, which is true.
 */
export const ASK_LEASE_MS = 24 * 60 * 60 * 1000;

/** Most events one guide keeps. One runaway agent must not be able to fill a thread. */
export const EVENTS_MAX = 200;

/** The longest evidence kept. A note is a line; this is a paste of output, so it gets room. */
export const EVIDENCE_MAX = 4000;

/**
 * The longest write-up kept: what somebody had to adapt to make a guide work where they ran it.
 *
 * Same size as evidence and a different thing. Evidence is what ran; a write-up is prose, and it
 * is the only part of a hand-in the next reader of the guide is shown. Its own size, because the
 * two are refused for different reasons and one of them may want changing without the other.
 */
export const WRITEUP_MAX = 4000;

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

/**
 * One Acceptance line, and what the agent ran for it. See migrations/0028_evidence_checks.sql.
 *
 * `cmd`, `exit` and `ok` are present when a runner executed the check rather than the agent
 * describing it — packages/passalong/src/checks.js, which runs locally where there is a shell.
 * `exit` is what the process returned and `ok` is whether the check holds; they are two fields for
 * the reason SARIF keeps `exitCode` beside `executionSuccessful`, "because not all programs exit
 * with an exit code of 0 on success and non-0 on failure". `exit` is null when the command never
 * ran at all, which is not the same as a check that failed.
 */
export interface Check {
  check: string;
  ran: string;
  /** What happened, in plain words, for the person: one sentence. Optional; the run is the proof. */
  says?: string;
  cmd?: string;
  exit?: number | null;
  ok?: boolean;
}

/** A check a runner executed, as opposed to one the agent wrote about. */
const verified = (c: Check): boolean =>
  Boolean(c?.cmd) && (typeof c?.exit === "number" || c?.exit === null);

/**
 * A screenshot or an upload, in text. Both `attach_screenshot` and `create_upload` end at the same
 * address, so one pattern answers for both.
 *
 * Written out here rather than imported from guide.ts, which owns the same regex: this module
 * takes no sibling `.ts` import on purpose — see the note at the top — because it is tested against
 * a real SQLite and Node's type stripping cannot follow a value import. A test holds the two
 * copies to the same pattern.
 */
const SHOT_RE = /\/v1\/shots\/[a-z0-9]{6,16}\b/;

/** A check the agent showed rather than ran: it points at a picture somebody can open. */
const shown = (c: Check): boolean => SHOT_RE.test(String(c?.ran ?? ""));

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
    // A check a runner executed answers for itself. The length rule is there to catch a sentence
    // standing in for output, and `test -f dist/app.js` exiting 0 is not that — it is the
    // strongest evidence on offer, and refusing it for being short would push agents back to prose.
    if (verified(c)) {
      if (c.ok === false)
        return (
          `"${String(c.check).trim().slice(0, 60)}" was handed in with a command that did not ` +
          "hold: a check that failed is not a check that passed"
        );
      continue;
    }
    const bad = evidenceProblem(c?.ran ?? "");
    if (bad) return `for "${String(c.check).trim().slice(0, 60)}", ${bad}`;
    // Ran, or shown. Nothing else is evidence.
    //
    // This refuses a command the agent pasted into `ran` as well as a sentence, and that is the
    // point rather than a side effect: "$ test -f dist/app.js" typed by the agent and the same
    // string executed by the runner are indistinguishable in the text and completely different in
    // what they prove. `cmd` is how the second one is said, and it costs nothing to say it.
    //
    // A check with no `cmd` is, by the agent's own filing, one no command settled — so it is the
    // visual or manual case, and the only thing that can answer it is a picture of it. Prose there
    // is the agent telling you what it saw: "a Sales Order PDF renders with the store's brand
    // colour" came back as "opened SO-00026 and the header bar is #1f6feb", which passed, and
    // nothing in the system had looked at anything.
    //
    // The asymmetry this removes: an image the USER showed the agent has been mandatory before
    // publish_guide and file_bugs for as long as those have existed, while an image that is the
    // only possible proof of the agent's OWN claim was never asked for once.
    if (!shown(c))
      return (
        `"${String(c.check).trim().slice(0, 60)}" was answered in words. Run it or show it: put ` +
        "the command in `cmd` and it is executed here, before this hand-in lands, and what it " +
        "prints is recorded instead of your account of it — pasting a command into `ran` is still " +
        "you typing. If no command can settle it, attach_screenshot and put the line it gives " +
        "you in `ran`: it takes a path in `file`, or the image itself in `data` as base64, so a " +
        "screenshot your browser handed back inline and never wrote to disk still goes in. If " +
        "you cannot get at the bytes either, capture it to a file — a headless browser\'s " +
        "page.screenshot({ path }) — rather than describing what you saw. A check that can be " +
        "neither run nor shown is not a check: say it in `writeup`, where it reads as your " +
        "account. Shoot the running thing: a scratch page built so there was something to " +
        "photograph is a picture of your own scaffolding, and deleting it afterwards leaves a " +
        "shot nobody can take again."
      );
  }
  return null;
}

/** The checks as one block of text, which is what every surface that predates them reads. */
export const flatten = (checks: Check[]): string =>
  checks
    .map((c) => {
      // The command and what it returned belong in the flattened block too: every surface that
      // predates `checks` reads only this, and "exited 0" is the part that makes it evidence.
      const how = verified(c)
        ? `\n[${c.cmd} → exited ${c.exit === null ? "nothing" : c.exit}]`
        : "";
      return `${c.check.trim()}${how}\n${String(c.ran ?? "").trim()}`;
    })
    .join("\n\n");

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
  /** What had to be adapted to make it work here. Prose, optional, and shown on the guide. */
  writeup: string;
  /** What it could break, in the hand-in's own words. Optional, for the reviewer. See 0032. */
  risk: string;
  /** The claim's generation. 0 on a claim taken before 0029_claim_fence.sql existed. */
  fence: number;
  /** The last reply this agent was given, by event id. See migrations/0038_conversation.sql. */
  replied_through: number;
  /** Set by `list()` and `working()`, not stored: the question this claim is waiting on, or ''. */
  asking?: string;
  /** Set by `working()`, not stored: what a person wrote that this agent has not been told yet. */
  waiting_replies?: number;
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

/**
 * The next generation number for this guide in this place. See migrations/0029_claim_fence.sql.
 *
 * Counts up and never goes back, because the counter outlives every claim on that card — the claim
 * row is deleted on release, on pass and on approve, and a number that reset with it would let the
 * same agent's stale write match a later claim. A take that then loses the race burns a number,
 * which costs nothing: what matters is that no number is ever handed out twice.
 */
async function nextFence(db: D1Database, id: string, place: string): Promise<number> {
  await db
    .prepare(
      `INSERT INTO claim_fence (guide_id, place, held) VALUES (?, ?, 1)
       ON CONFLICT(guide_id, place) DO UPDATE SET held = held + 1`,
    )
    .bind(id, place)
    .run();
  const row = await db
    .prepare("SELECT held FROM claim_fence WHERE guide_id = ? AND place = ?")
    .bind(id, place)
    .first<{ held: number }>();
  return row?.held ?? 1;
}

/**
 * What a write has to satisfy to count as coming from the agent that holds the claim.
 *
 * `fence` is optional on the way in and checked when it is there: an agent on a CLI older than
 * migration 0029 has no number to send, and refusing it would break every session mid-task on the
 * day this shipped. `0` is what those claims carry, and a claim taken since carries a real number,
 * so a stale write from a re-taken card is refused while an old client still works. Requiring it
 * is the follow-up, once published clients carry it.
 */
const heldBy = (fence?: number) => (typeof fence === "number" ? " AND fence = ?" : "");

/** What the agent is told when its number is not the current one: it is holding a stale card. */
const STALE =
  "this agent no longer holds that: it was released and taken again since. Take it again — " +
  "what you did is still in the worktree, and nothing here was overwritten.";

// A task the account may see: its own, or one shared to a team it is in.
const VISIBLE = `(g.account_id = ?1 OR (g.team_id <> '' AND g.team_id IN
  (SELECT team_id FROM membership WHERE account_id = ?1)))`;

// Addressed to this account, or to nobody in particular: a task assigned to one person or to one
// group is theirs to take, and the queue does not hand it to anyone else's agent.
const FOR_ME = `(g.to_account_id = '' OR g.to_account_id = ?1) AND (g.to_group_id = '' OR
  g.to_group_id IN (SELECT group_id FROM group_member WHERE account_id = ?1))`;

// The question this claim's agent is waiting on a person to answer, or null. Derived, as `stalled`
// is: the latest `asked` since the claim was taken that no `replied` has followed. Nothing moves a
// card to "waiting" and nothing has to move it back. See docs/CONVERSATION.md §4.2.
const ASKING = `(SELECT e.body FROM task_event e
   WHERE e.guide_id = c.guide_id AND e.kind = 'asked' AND e.at >= c.claimed_at
     AND NOT EXISTS (SELECT 1 FROM task_event r
                      WHERE r.guide_id = e.guide_id AND r.kind = 'replied' AND r.id > e.id)
   ORDER BY e.id DESC LIMIT 1)`;

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
    // A task's place is '', so the counter is per task. Burned when the insert below loses.
    const fence = await nextFence(db, task.id, "");
    const res = await db
      .prepare(
        `INSERT INTO claim (guide_id, account_id, agent_id, host, repo, worktree, state,
                            claimed_at, lease_until, updated, fence)
         VALUES (?, ?, ?, ?, ?, ?, 'claimed', ?, ?, ?, ?)
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
        fence,
      )
      .run();
    if (res.meta.changes === 1) {
      const claim = await claimFor(db, task.id, who);
      if (claim) {
        await event(db, task.id, "taken", {
          account: who.account,
          agent: who.agent,
          host: who.host,
          at,
        });
        return { task, claim, resumed: false };
      }
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

/** What happened, as `task_event` records it. See migrations/0037_task_event.sql. */
export type EventKind =
  | "taken"
  | "progress"
  | "handed_in"
  | "passed"
  | "released"
  | "approved"
  | "sent_back"
  | "closed"
  | "asked"
  | "replied"
  | "noted";

/**
 * Add one line to a guide's thread. Written after the transition it describes has succeeded, never
 * before and never in its place, and it never throws: a thread that loses a bubble is a smaller
 * harm than a hand-in refused because the history could not be written.
 */
async function event(
  db: D1Database,
  id: string,
  kind: EventKind,
  {
    account,
    agent = "",
    host = "",
    body = "",
    at,
  }: {
    account: string;
    agent?: string;
    host?: string;
    body?: string;
    at: string;
  },
): Promise<void> {
  // A progress note is the one thing an agent can write without limit, so it stops being recorded
  // first, and what a person is waiting for — a question, a reply, a hand-in — has room of its own.
  const cap = kind === "progress" ? EVENTS_MAX : EVENTS_MAX * 2;
  try {
    await db
      .prepare(
        `INSERT INTO task_event (guide_id, kind, account_id, agent_id, host, body, at)
         SELECT ?, ?, ?, ?, ?, ?, ?
          WHERE (SELECT COUNT(*) FROM task_event WHERE guide_id = ?) < ?`,
      )
      .bind(
        id,
        kind,
        account,
        agent,
        String(host || "").slice(0, 120),
        String(body ?? "")
          .trim()
          .slice(0, EVIDENCE_MAX),
        at,
        id,
        cap,
      )
      .run();
  } catch {}
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

  // A person saying they will do it, when their own agent already has it somewhere, is already
  // true: answer with that hold rather than adding a second one in the browser.
  if (!task && isPerson(who.agent)) {
    const own = await db
      .prepare(
        "SELECT * FROM claim WHERE guide_id = ? AND account_id = ? AND place <> '' ORDER BY updated DESC LIMIT 1",
      )
      .bind(id, who.account)
      .first<ClaimRow>();
    if (own) return { task: g, claim: own, resumed: true };
  }

  const place = task ? "" : repo;
  const fence = await nextFence(db, id, place);
  const res = await db
    .prepare(
      `INSERT INTO claim (guide_id, place, account_id, agent_id, host, repo, worktree, state,
                          claimed_at, lease_until, updated, fence)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'claimed', ?, ?, ?, ?)
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
      fence,
    )
    .run();
  if (res.meta.changes === 1) {
    if (!task && place && !isPerson(who.agent)) await dropPersonHold(db, id, who.account);
    const claim = await claimFor(db, id, who);
    if (claim) {
      await event(db, id, "taken", { account: who.account, agent: who.agent, host: who.host, at });
      return { task: g, claim, resumed: false };
    }
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
      /** What it says to a person. */
      summary: string;
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
              g.share_key AS g_share_key, g.account_id AS g_account, g.summary AS g_summary,
              COALESCE(${ASKING}, '') AS asking,
              (SELECT COUNT(*) FROM task_event r
                WHERE r.guide_id = c.guide_id AND r.kind IN ('replied', 'noted')
                  AND r.id > c.replied_through
                  AND (r.kind = 'noted' OR r.at >= c.claimed_at)) AS waiting_replies,
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
        g_summary: string;
        by_handle: string;
        by_name: string;
      }
    >();
  return results.map(
    ({
      g_title,
      g_kind,
      g_target,
      g_share_key,
      g_account,
      g_summary,
      by_handle,
      by_name,
      ...claim
    }) => ({
      guide: {
        id: claim.guide_id,
        title: g_title,
        summary: g_summary,
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
  { at, note, fence }: { at: string; note: string | null; fence?: number },
): Promise<ClaimRow | null> {
  const res = await db
    .prepare(
      `UPDATE claim SET lease_until = ?, updated = ?, note = COALESCE(?, note)
        WHERE guide_id = ? AND agent_id = ? AND account_id = ? AND state = 'claimed'${heldBy(fence)}`,
    )
    .bind(
      leaseFrom(at),
      at,
      note === null ? null : note.trim().slice(0, NOTE_MAX),
      id,
      who.agent,
      who.account,
      ...(typeof fence === "number" ? [fence] : []),
    )
    .run();
  if (res.meta.changes !== 1) return null;
  const said = note === null ? "" : note.trim();
  if (said)
    await event(db, id, "progress", {
      account: who.account,
      agent: who.agent,
      host: who.host,
      body: said.slice(0, NOTE_MAX),
      at,
    });
  return claimFor(db, id, who);
}

/**
 * The agent asks a person something and waits, keeping what it holds.
 *
 * It is not `pass`, which gives the work back, and not `progress`, which says "carry on" — an
 * agent that is told to stop and an agent that is told to continue need different endings, so they
 * are different calls. The claim stays, nobody else can take the work, and the lease is extended to
 * ASK_LEASE_MS because a person's answer takes longer than half an hour. `note` is set to the
 * question's first line, so every surface that shows what an agent last said still shows it.
 *
 * Whether a claim is waiting is derived from the events (ASKING), not stored here.
 */
export async function ask(
  db: D1Database,
  id: string,
  who: Agent,
  { at, question, fence }: { at: string; question: string; fence?: number },
): Promise<{ claim: ClaimRow } | { error: string; status: 400 | 409 }> {
  const q = String(question ?? "")
    .trim()
    .slice(0, MESSAGE_MAX);
  if (!q) return { status: 400, error: "say what you need to know: send `question`" };
  const res = await db
    .prepare(
      `UPDATE claim SET lease_until = ?, updated = ?, note = ?
        WHERE guide_id = ? AND agent_id = ? AND account_id = ? AND state = 'claimed'${heldBy(fence)}`,
    )
    .bind(
      leaseFrom(at, ASK_LEASE_MS),
      at,
      (q.split(/\r?\n/)[0] ?? q).slice(0, NOTE_MAX),
      id,
      who.agent,
      who.account,
      ...(typeof fence === "number" ? [fence] : []),
    )
    .run();
  if (res.meta.changes !== 1) {
    const now = await claimFor(db, id, who);
    return {
      status: 409,
      error:
        typeof fence === "number" && now && now.fence !== fence
          ? STALE
          : "this agent does not hold that — there is nobody waiting on it to ask",
    };
  }
  await event(db, id, "asked", {
    account: who.account,
    agent: who.agent,
    host: who.host,
    body: q,
    at,
  });
  const claim = await claimFor(db, id, who);
  return claim ? { claim } : { status: 409, error: "the claim went away while asking" };
}

/**
 * A person writes to whoever holds a guide.
 *
 * Not a comment box, and these are the rules that keep it from becoming one: there has to be a
 * holder, because a message with nobody to hear it is a comment; only the people on the asking side
 * may write — the author, whoever it is assigned to, and the holder's own account, which is the
 * common case of somebody replying to their own agent — and not anyone who can read the guide; and
 * it is plain text with no edit and no delete. See docs/CONVERSATION.md §2.
 *
 * Does not extend the lease: only the agent speaking does. Returns who holds it, to tell them.
 * Whether the caller can read the guide at all is the route's to settle first.
 */
export async function reply(
  db: D1Database,
  id: string,
  { account, at, body }: { account: string; at: string; body: string },
): Promise<
  { holders: string[]; noted: boolean } | { error: string; status: 400 | 403 | 404 | 409 }
> {
  const text = String(body ?? "")
    .trim()
    .slice(0, MESSAGE_MAX);
  if (!text) return { status: 400, error: "write the message: send `body`" };
  const g = await db
    .prepare("SELECT account_id, to_account_id, to_group_id, status FROM guide WHERE id = ?")
    .bind(id)
    .first<{ account_id: string; to_account_id: string; to_group_id: string; status: string }>();
  if (!g) return { status: 404, error: "no such guide" };
  const { results: held } = await db
    .prepare("SELECT account_id FROM claim WHERE guide_id = ? AND state = 'claimed'")
    .bind(id)
    .all<{ account_id: string }>();
  const inGroup =
    g.to_group_id !== "" &&
    Boolean(
      await db
        .prepare("SELECT 1 FROM group_member WHERE group_id = ? AND account_id = ?")
        .bind(g.to_group_id, account)
        .first(),
    );
  const party = g.account_id === account || g.to_account_id === account || inGroup;
  const allowed = party || held.some((h) => h.account_id === account);
  if (!allowed)
    return {
      status: 403,
      error: "only its author, whoever it is assigned to, or whoever holds it can write here",
    };
  // Nobody holds it. Its author may still leave a note, and it is waiting for whoever takes it: a
  // file the task needs, a thing they thought of after writing it. It is the task's own, not a message
  // to anybody, so it is its own kind and every taker is handed all of it. Done work takes no more.
  const noted = !held.length;
  if (noted && g.status === "consumed")
    return { status: 409, error: "this is done, so there is nobody to leave a note for" };
  const full = await db
    .prepare("SELECT COUNT(*) AS n FROM task_event WHERE guide_id = ?")
    .bind(id)
    .first<{ n: number }>();
  if ((full?.n ?? 0) >= EVENTS_MAX * 2)
    return {
      status: 409,
      error: "this conversation is full: hand it in, or pass it and start again",
    };
  await event(db, id, noted ? "noted" : "replied", { account, body: text, at });
  return { holders: [...new Set(held.map((h) => h.account_id))], noted };
}

/** What a person said to an agent, as the agent is told it. */
export interface Reply {
  id: number;
  at: string;
  by: { name: string; handle: string; you: boolean };
  body: string;
}

/**
 * The replies this agent has not been told yet, oldest first, moving its cursor past them.
 *
 * There is no way to push into a worktree, so this is how a reply arrives: asked for on the agent's
 * next `progress` or `take`. `resume` is for a `take` that picks a hold back up, and re-sends
 * everything since the last question even past the cursor — a response lost on the wire, or a
 * session restarted after the agent stopped to wait, would otherwise lose a reply for good, and a
 * resume is rare and replies are short.
 */
export async function deliver(
  db: D1Database,
  id: string,
  who: Agent,
  { resume = false }: { resume?: boolean } = {},
): Promise<Reply[]> {
  const c = await claimFor(db, id, who);
  if (!c) return [];
  let from = c.replied_through;
  if (resume) {
    const q = await db
      .prepare(
        "SELECT COALESCE(MAX(id), 0) AS id FROM task_event WHERE guide_id = ? AND kind = 'asked' AND at >= ?",
      )
      .bind(id, c.claimed_at)
      .first<{ id: number }>();
    // One below the question, so a reply that came straight after it is still in range.
    if (q?.id) from = Math.min(from, q.id - 1);
  }
  const { results } = await db
    .prepare(
      `SELECT e.id, e.at, e.body, e.account_id, COALESCE(a.name, '') AS name,
              COALESCE(a.handle, '') AS handle
         FROM task_event e LEFT JOIN account a ON a.id = e.account_id
        WHERE e.guide_id = ? AND e.kind IN ('replied', 'noted') AND e.id > ?
          AND (e.kind = 'noted' OR e.at >= ?)
        ORDER BY e.id LIMIT 50`,
    )
    .bind(id, from, c.claimed_at)
    .all<{
      id: number;
      at: string;
      body: string;
      account_id: string;
      name: string;
      handle: string;
    }>();
  const last = results[results.length - 1];
  if (last)
    await db
      .prepare(
        `UPDATE claim SET replied_through = MAX(replied_through, ?)
          WHERE guide_id = ? AND agent_id = ? AND account_id = ?`,
      )
      .bind(last.id, id, who.agent, who.account)
      .run();
  return results.map((r) => ({
    id: r.id,
    at: r.at,
    by: { name: r.name, handle: r.handle, you: r.account_id === who.account },
    body: r.body,
  }));
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
    risk = "",
    fence,
  }: {
    at: string;
    report: string;
    evidence: string;
    /** Evidence against each line the task asked for. The better shape, and not the only one. */
    checks?: Check[];
    pr?: string;
    note?: string;
    /** What it could break. See 0032_claim_risk.sql. */
    risk?: string;
    /** The claim's generation, from take. Checked when it is there. See 0029_claim_fence.sql. */
    fence?: number;
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
              risk = ?, note = COALESCE(NULLIF(?, ''), note), updated = ?
        WHERE guide_id = ? AND agent_id = ? AND account_id = ? AND state = 'claimed'${heldBy(fence)}`,
    )
    .bind(
      report,
      pr.trim().slice(0, 400),
      said.trim().slice(0, EVIDENCE_MAX),
      checks.length
        ? JSON.stringify(
            checks.map((c) => ({
              check: c.check.trim().slice(0, NOTE_MAX),
              ran: String(c.ran ?? "")
                .trim()
                .slice(0, EVIDENCE_MAX),
              ...(c.says?.trim() ? { says: c.says.trim().slice(0, NOTE_MAX) } : {}),
              ...(verified(c)
                ? { cmd: String(c.cmd).slice(0, NOTE_MAX), exit: c.exit, ok: c.ok === true }
                : {}),
            })),
          ).slice(0, EVIDENCE_MAX * 2)
        : "",
      String(risk ?? "")
        .trim()
        .slice(0, NOTE_MAX),
      note.trim().slice(0, NOTE_MAX),
      at,
      id,
      who.agent,
      who.account,
      ...(typeof fence === "number" ? [fence] : []),
    )
    .run();
  if (res.meta.changes !== 1) {
    // Two ways to miss, and they read differently to whoever is holding the worktree: the card was
    // taken away, or it was taken away and given back and this write belongs to the claim before.
    const now = await claimFor(db, id, who);
    return {
      status: 409,
      error:
        typeof fence === "number" && now && now.fence !== fence
          ? STALE
          : "this agent does not hold that task — it was released, or never taken here",
    };
  }
  const claim = await claimFor(db, id, who);
  if (claim)
    await event(db, id, "handed_in", {
      account: who.account,
      agent: who.agent,
      host: who.host,
      body: note,
      at,
    });
  return claim ? { claim } : { status: 409, error: "the claim went away while finishing" };
}

/** A hold nobody has heard from, and who should be told about it. See stalled(). */
export interface Stall {
  guide_id: string;
  title: string;
  kind: string;
  /** The guide's author — the only person who can release it. */
  author: string;
  /** Where it was last seen, for the sentence. Empty when a person took it in the browser. */
  where: string;
  note: string;
  lease_until: string;
}

/**
 * Holds whose lease has run out, for something on a clock to announce.
 *
 * `stalled` is derived on read and never stored, which is right — storing it would need something
 * running on a clock to write it. The cost is that nothing can *tell* anyone: the state comes into
 * existence when a person opens the hub, so work goes quiet and stays quiet until somebody
 * happens to look. This is the one read that happens without a person, so the state reaches them.
 *
 * It does not release anything. A lapsed lease still holds its card (docs/V2.md §5) and this does
 * not change that; it only stops the silence being the author's job to notice.
 *
 * Only what is still being worked on: a claim in `review` is waiting on a person, not gone quiet,
 * and its lease lapsing means nothing.
 *
 * `since` is what makes this an announcement rather than a nag. Without it every run would return
 * everything still quiet, and `notify` refreshes a repeat's timestamp — so a card nobody had got
 * to would climb back up the feed on every tick, which on an hourly cron is how somebody learns to
 * ignore the feed. A window returns each lease in the one run it crosses into silence. An agent
 * that comes back and goes quiet again moves its lease forward and crosses again, which is a
 * second thing happening and worth a second line.
 *
 * Pass a window wider than the gap between runs: a tick missed by a deploy would otherwise drop
 * the notice for good, and the overlap costs nothing — `notify` coalesces a repeat onto the one
 * row rather than writing another.
 */
export async function stalled(db: D1Database, at: string, since = ""): Promise<Stall[]> {
  const { results } = await db
    .prepare(
      `SELECT c.guide_id, c.note, c.lease_until, c.host, c.worktree,
              g.title, g.kind, g.account_id AS author
         FROM claim c JOIN guide g ON g.id = c.guide_id
        WHERE c.state = 'claimed' AND c.lease_until <= ?1
          AND (?2 = '' OR c.lease_until > ?2)
        ORDER BY c.lease_until ASC
        LIMIT 200`,
    )
    .bind(at, since)
    .all<{
      guide_id: string;
      note: string;
      lease_until: string;
      host: string;
      worktree: string;
      title: string;
      kind: string;
      author: string;
    }>();
  return results.map((r) => ({
    guide_id: r.guide_id,
    title: r.title,
    kind: r.kind,
    author: r.author,
    where: [r.host, r.worktree].filter(Boolean).join(":"),
    note: r.note,
    lease_until: r.lease_until,
  }));
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
      /** What it says to a person. Empty on a task from before summaries. */
      summary: string;
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
        `SELECT g.id, g.account_id, g.title, g.summary, g.status, g.target, g.created, g.share_key,
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
          summary: string;
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
                COALESCE(${ASKING}, '') AS asking,
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
 * A task this account wrote, with its claim, or a refusal. The gate is the author's: approving and
 * rejecting both decide what happens to work somebody asked for, and only they asked.
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

/** The same gate, of any kind: releasing is something an author does to work of theirs. */
async function authoredAnyKind(
  db: D1Database,
  id: string,
  account: string,
): Promise<{ markdown: string; kind: string } | { error: string; status: 404 }> {
  const g = await db
    .prepare("SELECT markdown, kind FROM guide WHERE id = ? AND account_id = ?")
    .bind(id, account)
    .first<{ markdown: string; kind: string }>();
  return g || { status: 404, error: "no such guide of yours — only its author takes it back" };
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
  await event(db, id, "approved", { account, at });
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
  await event(db, id, "sent_back", { account, body: reason, at });
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
): Promise<
  { state: "ready"; claimants: string[]; places: number } | { error: string; status: 404 | 409 }
> {
  const g = await authoredAnyKind(db, id, account);
  if ("error" in g) return g;

  // Every live claim, because a handoff has one per repo: three people in three checkouts can each
  // hold the same guide legitimately, and "take it back" means from whoever has it, not from
  // whichever of them the query happened to return first. A task has one place, so this is the
  // same single row it always was.
  const { results: held } = await db
    .prepare("SELECT * FROM claim WHERE guide_id = ? AND state = 'claimed'")
    .bind(id)
    .all<ClaimRow>();
  if (!held.length) {
    const waiting = await db
      .prepare("SELECT 1 FROM claim WHERE guide_id = ? AND state = 'review' LIMIT 1")
      .bind(id)
      .first();
    return {
      status: 409,
      error: waiting
        ? "this is handed in and waiting on you — approve it, or send it back with a reason"
        : "nobody holds this",
    };
  }

  const writes = [
    db.prepare("DELETE FROM claim WHERE guide_id = ? AND state = 'claimed'").bind(id),
  ];
  // Where the work was left, written into the document so the next person picks it up rather than
  // starting over. `## Review notes` is a task's section; a handoff has no place for it, and
  // inventing one inside somebody's published guide is not this function's business — the holders
  // are told either way, and `working()` already showed where it was.
  if (g.kind === "task") {
    const c = held[0] as ClaimRow;
    const where = [c.host, c.worktree].filter(Boolean).join(":") || `agent ${c.agent_id}`;
    const said = c.note ? `; last progress: "${c.note}"` : "";
    const markdown = withNote(g.markdown, `${at.slice(0, 10)} released from ${where}${said}`);
    writes.push(
      db.prepare("UPDATE guide SET markdown = ?, updated = ? WHERE id = ?").bind(markdown, at, id),
    );
  }
  await db.batch(writes);
  await event(db, id, "released", {
    account,
    host: (held[0] as ClaimRow).host,
    body: (held[0] as ClaimRow).note,
    at,
  });
  // Two counts, because they are two different things: `claimants` is who to tell, deduped because
  // one person told twice is one person told twice; `places` is how many claims went, which is
  // what "taken back from three repos" means and is not the same number.
  return {
    state: "ready",
    claimants: [...new Set(held.map((c) => c.account_id))],
    places: held.length,
  };
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
  { at, why, fence }: { at: string; why: string; fence?: number },
): Promise<{ kind: string; author: string } | { error: string; status: 400 | 409 }> {
  const reason = String(why ?? "")
    .trim()
    .slice(0, 1000);
  if (!reason)
    return { status: 400, error: "say why you are passing it, so whoever is next knows" };
  const c = await claimFor(db, id, who);
  // Passing gives the card back, so a stale one would hand back work somebody else is doing.
  if (c && typeof fence === "number" && c.fence !== fence) return { status: 409, error: STALE };
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
  await event(db, id, "passed", {
    account: who.account,
    agent: who.agent,
    host: c.host,
    body: reason,
    at,
  });
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
    checks = [],
    writeup = "",
    risk = "",
    person = false,
    fence,
    verdict,
  }: {
    at: string;
    note: string;
    evidence: string;
    /**
     * The guide's `## Verification`, line by line, with what was run for each.
     *
     * A task has had this since migration 0028, against `## Acceptance`. A handoff — the product's
     * main artifact — answered with a boolean and a paragraph, so the expectation was a list and
     * the response was prose. An agent that has read a guide and done the work then has no shape
     * to fill and no way to tell when it is finished, which is why hand-ins came back as a
     * separate published guide titled "Hand-in evidence: …", or as `pass` with a note.
     *
     * Same field, same column, same rule: the response is evidence against what was asked.
     */
    checks?: Check[];
    /**
     * What had to be adapted to make it work here, in prose.
     *
     * Never required and never refused for its shape: it is the part of a hand-in that has no
     * right answer, and a rule about its length would only teach agents to pad it. It is also the
     * only part the next reader of the guide is shown, which is the whole reason it exists —
     * "step 4 needed MAIL_FROM and the bucket name here" was becoming a published guide because
     * `ok` is a boolean, `note` is 280 characters, and `evidence` is what you ran.
     */
    writeup?: string;
    /** What it could break. See 0032_claim_risk.sql. */
    risk?: string;
    person?: boolean;
    fence?: number;
    /** Store an agent's answer only if this claim can move to review. */
    verdict?: { ok: boolean };
  },
): Promise<{ claim: ClaimRow } | { error: string; status: 400 | 409 }> {
  // Checks are evidence, so a hand-in that brings them has brought it — as in finish().
  const said = checks.length ? flatten(checks) : evidence;
  const bad = person ? null : checks.length ? checksProblem(checks) : evidenceProblem(evidence);
  if (bad) return { status: 400, error: bad };
  const detail = String(evidence ?? "").slice(0, EVIDENCE_MAX);
  const storedChecks = checks.length ? JSON.stringify(checks).slice(0, EVIDENCE_MAX * 2) : "";
  const storedWriteup = String(writeup ?? "")
    .trim()
    .slice(0, WRITEUP_MAX);
  const transition = db
    .prepare(
      `UPDATE claim SET state = 'review', evidence = ?, checks = ?, writeup = ?, risk = ?,
              note = COALESCE(NULLIF(?, ''), note), updated = ?
        WHERE guide_id = ? AND agent_id = ? AND account_id = ? AND state = 'claimed'${heldBy(fence)}`,
    )
    .bind(
      String(said ?? "")
        .trim()
        .slice(0, EVIDENCE_MAX),
      checks.length
        ? JSON.stringify(
            checks.map((c) => ({
              check: c.check.trim().slice(0, NOTE_MAX),
              ran: String(c.ran ?? "")
                .trim()
                .slice(0, EVIDENCE_MAX),
              ...(c.says?.trim() ? { says: c.says.trim().slice(0, NOTE_MAX) } : {}),
              ...(c.cmd && (typeof c.exit === "number" || c.exit === null)
                ? { cmd: String(c.cmd).slice(0, NOTE_MAX), exit: c.exit, ok: c.ok === true }
                : {}),
            })),
          ).slice(0, EVIDENCE_MAX * 2)
        : "",
      storedWriteup,
      String(risk ?? "")
        .trim()
        .slice(0, NOTE_MAX),
      String(note ?? "")
        .trim()
        .slice(0, NOTE_MAX),
      at,
      id,
      who.agent,
      who.account,
      ...(typeof fence === "number" ? [fence] : []),
    );
  // D1 batches execute in one transaction. The verdict SELECT and the transition use the same
  // claim predicate, so a refused or stale hand-in cannot leave a verdict on the guide.
  const writes = verdict
    ? [
        db
          .prepare(
            `INSERT INTO verdict (guide_id, account_id, ok, note, detail, checks, writeup, at)
             SELECT guide_id, account_id, ?, ?, ?, ?, ?, ? FROM claim
              WHERE guide_id = ? AND agent_id = ? AND account_id = ? AND state = 'claimed'${heldBy(fence)}
             ON CONFLICT(guide_id, account_id) DO UPDATE SET ok = excluded.ok,
               note = excluded.note, detail = excluded.detail, checks = excluded.checks,
               writeup = CASE WHEN excluded.writeup <> '' THEN excluded.writeup ELSE verdict.writeup END,
               at = excluded.at`,
          )
          .bind(
            verdict.ok ? 1 : 0,
            String(note ?? "")
              .trim()
              .slice(0, NOTE_MAX),
            detail,
            storedChecks,
            storedWriteup,
            at,
            id,
            who.agent,
            who.account,
            ...(typeof fence === "number" ? [fence] : []),
          ),
        transition,
      ]
    : [transition];
  const results = await db.batch(writes);
  const res = results[results.length - 1];
  const claim = res?.meta.changes === 1 ? await claimFor(db, id, who) : null;
  // Handed in by the person's own agent: any browser hold of theirs is done with too. A hold taken
  // before the rule in take() existed is cleared here, the next time that work comes back.
  if (claim && claim.place && !isPerson(who.agent)) await dropPersonHold(db, id, who.account);
  if (claim) {
    await event(db, id, "handed_in", {
      account: who.account,
      agent: who.agent,
      host: who.host,
      body: note,
      at,
    });
    return { claim };
  }
  const now = await claimFor(db, id, who);
  return {
    status: 409,
    error:
      typeof fence === "number" && now && now.fence !== fence
        ? STALE
        : "this agent does not hold that — take it first, or it was taken back",
  };
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
export type StepEvent =
  | "taken"
  | "progress"
  | "asked"
  | "handed_in"
  | "passed"
  | "nothing"
  | "not_held";

/**
 * What an agent should do next, attached to every answer it gets. See docs/V2.md §11.
 *
 * Instructions an agent read at the start of a long session are the first thing it forgets; the
 * answer to the call it just made is the last thing it read. So the next move rides on that answer,
 * worked out here because only the server knows the state. `say` is set when the right move is to
 * make no call at all: stop, or tell the person.
 */
export function steps(kind: string, event: StepEvent, replies = 0): { next: Step[]; say?: string } {
  const done =
    kind === "task"
      ? "every line of Acceptance holds"
      : "every line of its Verification has been run here and has an answer";
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
      // The same shape for both, against the section each kind asks with. A handoff used to be
      // told to send "evidence" — a paragraph, answering a list — so an agent that had read the
      // guide and done the work had nothing shaped like the question, and improvised: prose, or a
      // second guide titled "Hand-in evidence: …", or `pass` with a note. The list it is answering
      // is already written down; this points at it.
      with:
        "note: one plain sentence, first person — what you did and how it went. It is the first " +
        "thing the person reads; everything below is behind it. " +
        (kind === "task"
          ? "checks: one entry per Acceptance line — that line, and what you ran for it. Its " +
            "author reads them line against line, so evidence filed under the check it answers is " +
            "worth more than the same output in one block. Keep it as you go."
          : "checks: one entry per line of its `## Verification` — that line, and what you ran " +
            "for it. That is what its author reads, line against line. You are done when every " +
            "line has one. Keep them as you go; `evidence` as one block is the older shape and " +
            "still accepted. Anything you had to adapt to make it work here goes in `writeup`, " +
            "and the next person to open the guide is shown it — that is its home, not a new " +
            "guide."),
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
      return replies
        ? {
            next: working,
            say:
              replies === 1
                ? "The person left you a message (below). Read it first and carry on from what they said."
                : `The person wrote ${replies} messages (below). Read them first and carry on from what they said.`,
          }
        : { next: working };
    case "asked":
      return {
        next: [
          {
            tool: "take",
            when: "once the person has answered, with this id",
            why: "it hands you their reply and picks the work back up",
          },
        ],
        say: "Your question is sent. Stop here and tell the user you are waiting for their answer.",
      };
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

/** One line of a guide's thread: something an agent or a person did to it, oldest first. */
export interface ThreadItem {
  /** `e<n>` for a recorded event, `v:<account>` / `a:<account>` for a verdict or an ack. */
  id: string;
  kind: EventKind | "verdict" | "ack";
  at: string;
  /** One line, in the voice of whoever did it. Empty for acts that say everything by themselves. */
  body: string;
  /** Only a verdict or an ack: whether it worked, or whether they took it. */
  ok?: boolean;
  by: { name: string; handle: string; agent: boolean; host: string; you: boolean };
}

/**
 * A guide's thread: what happened to it, in order, as the conversation a person would read.
 *
 * Merges `task_event` with the verdicts and acks already on the guide, which are the reader's side
 * of the same conversation and live in their own tables for their own reasons (migrations 0004 and
 * 0013). Nothing here is stored twice: when a person answers in the browser the route also writes
 * the claim transition their answer causes, and that event is dropped here in favour of the answer
 * itself, so one act is one line.
 *
 * Who may read it is the caller's to settle — this is a query, and the route asks `readableGuide`.
 */
export async function thread(db: D1Database, id: string, viewer: string): Promise<ThreadItem[]> {
  const { results: events } = await db
    .prepare(
      `SELECT e.id, e.kind, e.at, e.body, e.account_id, e.agent_id, e.host,
              COALESCE(a.name, '') AS name, COALESCE(a.handle, '') AS handle
         FROM task_event e LEFT JOIN account a ON a.id = e.account_id
        WHERE e.guide_id = ? ORDER BY e.id LIMIT 500`,
    )
    .bind(id)
    .all<{
      id: number;
      kind: EventKind;
      at: string;
      body: string;
      account_id: string;
      agent_id: string;
      host: string;
      name: string;
      handle: string;
    }>();
  const { results: verdicts } = await db
    .prepare(
      `SELECT v.account_id, v.ok, v.note, v.at, COALESCE(a.name, '') AS name,
              COALESCE(a.handle, '') AS handle
         FROM verdict v LEFT JOIN account a ON a.id = v.account_id WHERE v.guide_id = ?`,
    )
    .bind(id)
    .all<{
      account_id: string;
      ok: number;
      note: string;
      at: string;
      name: string;
      handle: string;
    }>();
  const { results: acks } = await db
    .prepare(
      `SELECT k.account_id, k.taken, k.note, k.at, COALESCE(a.name, '') AS name,
              COALESCE(a.handle, '') AS handle
         FROM ack k LEFT JOIN account a ON a.id = k.account_id WHERE k.guide_id = ?`,
    )
    .bind(id)
    .all<{
      account_id: string;
      taken: number;
      note: string;
      at: string;
      name: string;
      handle: string;
    }>();

  const answered = new Set([
    ...verdicts.map((v) => `handed_in:${v.account_id}`),
    ...acks.map((k) => `${k.taken ? "taken" : "passed"}:${k.account_id}`),
  ]);
  const person = (agent: string) => agent.startsWith("person-");
  const items: ThreadItem[] = [];
  for (const e of events) {
    // A person's own hold and hand-in made in the browser are the ack and the verdict they just gave.
    if (person(e.agent_id) && answered.has(`${e.kind}:${e.account_id}`)) continue;
    items.push({
      id: `e${e.id}`,
      kind: e.kind,
      at: e.at,
      body: e.body,
      by: {
        name: e.name,
        handle: e.handle,
        agent: Boolean(e.agent_id) && !person(e.agent_id),
        host: e.host,
        you: e.account_id === viewer,
      },
    });
  }
  const you = (account: string) => account === viewer;
  for (const v of verdicts)
    items.push({
      id: `v:${v.account_id}`,
      kind: "verdict",
      at: v.at,
      body: v.note,
      ok: v.ok === 1,
      by: { name: v.name, handle: v.handle, agent: false, host: "", you: you(v.account_id) },
    });
  for (const k of acks)
    items.push({
      id: `a:${k.account_id}`,
      kind: "ack",
      at: k.at,
      body: k.note,
      ok: k.taken === 1,
      by: { name: k.name, handle: k.handle, agent: false, host: "", you: you(k.account_id) },
    });
  return items.sort((x, y) => (x.at === y.at ? 0 : x.at < y.at ? -1 : 1));
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
 * The author closes their own guide: it is done, the way an approved task is — archived as
 * `consumed` — and every claim on it goes, handed in or not. Returns who had it, to tell them.
 *
 * It was called closeHandedIn, and read as though a hand-in were the precondition. It never was —
 * the gate is only that you wrote it — and the name was the reason the hub offered this on a
 * hand-in row and nowhere else. So a guide whose receiver never engaged had no way off the board
 * at all: leaving `Open` needs somebody else to open it and say it worked, and when they never do,
 * the author is the one person who knows the work is finished and the one with no verb for it.
 */
export async function closeGuide(
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
  await event(db, id, "closed", { account, at });
  return { claimants: results.map((r) => r.account_id) };
}

/**
 * Guides sent to somebody that nothing has happened to, for something on a clock to close.
 *
 * "Nothing" is meant strictly: nobody pulled it, nobody said they were taking it, nobody holds it,
 * nobody gave a verdict. A guide with any of those is a conversation in progress, however slow,
 * and closing it would be taking it off somebody's list while they are still on it.
 *
 * `consumed` is the right end for this and not a lie about the work: it is the author's shelf,
 * reversible, and explicitly not a judgement that the work landed. What it says is that this
 * stopped being live, which after a fortnight of silence it did.
 */
/**
 * How long a sent guide may sit with nothing happening to it before the clock shelves it.
 *
 * A fortnight, because the thing being measured is a person not getting to something, and people
 * are away for a week. Short enough that a board is not carrying a month of guides nobody opened;
 * long enough that "I was on leave" does not lose you your work — and it is reversible anyway.
 */
export const STALE_SENT_MS = 14 * 24 * 60 * 60 * 1000;

export async function staleSent(
  db: D1Database,
  before: string,
): Promise<{ id: string; account_id: string; title: string; team_id: string; to: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT g.id, g.account_id, g.title, g.team_id, g.to_account_id AS to_id, g.to_group_id
         FROM guide g
        WHERE g.kind <> 'task' AND g.status = 'published' AND g.updated <= ?
          AND (g.to_account_id <> '' OR g.to_group_id <> '' OR g.team_id <> '')
          AND NOT EXISTS (SELECT 1 FROM pull p WHERE p.guide_id = g.id AND p.account_id <> g.account_id)
          AND NOT EXISTS (SELECT 1 FROM ack a WHERE a.guide_id = g.id)
          AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.guide_id = g.id)
          AND NOT EXISTS (SELECT 1 FROM verdict v WHERE v.guide_id = g.id)
        ORDER BY g.updated ASC
        LIMIT 100`,
    )
    .bind(before)
    .all<{
      id: string;
      account_id: string;
      title: string;
      team_id: string;
      to_id: string;
      to_group_id: string;
    }>();
  return results.map((r) => ({
    id: r.id,
    account_id: r.account_id,
    title: r.title,
    team_id: r.team_id,
    to: r.to_id,
  }));
}

/**
 * The author turns one hand-in down: that repo's claim goes, so the handoff is open there again,
 * and the reason goes to whoever handed it in. The reason is required, as it is for a task.
 */
export async function sendBackHandedIn(
  db: D1Database,
  id: string,
  { account, at, place, why }: { account: string; at: string; place: string; why: string },
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
  await event(db, id, "sent_back", { account, body: String(why).trim(), at });
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
    .prepare("SELECT kind, markdown, account_id FROM guide WHERE id = ?")
    .bind(id)
    .first<{ kind: string; markdown: string; account_id: string }>();
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
  if (g)
    await event(db, id, "released", { account: g.account_id, host: out[0]!.host, body: why, at });
  return [...new Set(out.map((c) => c.account_id))];
}
