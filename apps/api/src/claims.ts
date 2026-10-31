/**
 * Work an agent can take: the queue, the claim, the lease. See docs/WORK.md and
 * migrations/0021_claims.sql and 0061_one_thing.sql.
 *
 * The one rule this module exists to keep: no two agents ever hold the same work. One piece of work
 * has one holder. The claim's primary key is the lock, and a lease that runs out does not release
 * it — a card whose agent went quiet is `stalled`, still locked, until a person releases it, the
 * same agent comes back, or the hourly sweep puts it back in the queue.
 *
 * Imports no sibling `.ts` on purpose, like billing.ts: it is tested against a real SQLite with
 * the real migrations, and a value import of a sibling is what Node's type stripping cannot follow.
 */

/** How long a claim holds without word from its agent. Every progress call starts it again. */
export const LEASE_MS = 30 * 60 * 1000;

/**
 * How long a person's hold lasts. A person taking work in the browser does not report
 * progress every half hour the way an agent does, and "went quiet" after thirty minutes would be
 * a lie about somebody who is simply working. A week, then it reads as stalled like anything else.
 */
export const PERSON_LEASE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The claim-holder a person is when they take something in the browser, rather than an agent.
 *
 * A person and their own agent are one party to the work. Saying "I'll do this" in the hub holds it
 * as the person; their agent then taking it in a repo is the same work arriving somewhere, so that
 * hold gives way to the agent's.
 */
export const personAgent = (account: string) =>
  `person-${account.toLowerCase().replace(/[^a-z0-9-]/g, "")}`;
const isPerson = (agent: string) => agent.startsWith("person-");

/** Let go of this account's browser hold on work, now that its own agent is taking it. */
function dropPersonHold(db: D1Database, id: string, account: string) {
  return db
    .prepare(
      "DELETE FROM claim WHERE work_id = ? AND account_id = ? AND agent_id LIKE 'person-%' AND state = 'claimed'",
    )
    .bind(id, account)
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

/** Most events one piece of work keeps. One runaway agent must not be able to fill a thread. */
export const EVENTS_MAX = 200;

/** The longest evidence kept. A note is a line; this is a paste of output, so it gets room. */
export const EVIDENCE_MAX = 4000;

/**
 * The longest write-up kept: what somebody had to adapt, and why.
 *
 * Same size as evidence and a different thing. Evidence is what ran; a write-up is prose. Its own
 * size, because the two are refused for different reasons and one may want changing alone.
 */
export const WRITEUP_MAX = 4000;

/**
 * The longest write-up a hand-in may send: what had to be adapted and why, in a
 * few lines. Hand-ins averaged 5,400 characters and most were never read; anything longer belongs
 * in the diff or a follow-up. Refused rather than cut, so the agent says it shorter itself.
 */
export const WRITEUP_CAP = 500;

/**
 * Finishing is final, so it has to show something a person can look at: a
 * screenshot, a before and after, or the one command and the line of output that decides it.
 * Checks already answer for themselves — each is run here or shown (checksProblem) — so this is the
 * rule for evidence sent as one block, where sixteen characters of anything used to pass.
 */
export function proofProblem(evidence: string, checks: Check[]): string | null {
  if (checks.length) return null;
  const said = String(evidence ?? "");
  if (/\/v1\/shots\/[a-z0-9]{6,16}/.test(said)) return null;
  // A command and what it printed: `$ cmd` with a line after it, `cmd → result` on one line, or a
  // command in backticks with its result after it ("ran `pnpm test`: 12 passed").
  if (
    /(^|\n)\s*\$\s*\S[^\n]*\n\s*\S/.test(said) ||
    /\S\s*(→|->|=>)\s*\S/.test(said) ||
    /`[^`\n]+`[^\n`]*[A-Za-z0-9]/.test(said)
  )
    return null;
  return (
    "show it: finishing is final, so it needs one thing a person can look at. For anything with " +
    "a screen, a screenshot (add_file) — before and after, for a bug. " +
    "For backend work, the one command you ran and the line of its output that shows it works: " +
    '"$ npm test" then "41 pass, 0 fail", or "npm test → 41 pass, 0 fail".'
  );
}

/**
 * What a hand-in has to bring, in the words an agent is refused with.
 *
 * "Done" is the agent's word for its own work, and a write-up is the agent's word written longer.
 * Neither tells the person at the gate what actually ran. Evidence is the other side of that: the
 * command and what came back, a test summary, a link to the change, a screenshot url.
 *
 * The rule is deliberately one rule — something was sent, and it is longer than a proof — rather
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
 * Where work is, as a column name. Derived from the work and its claim on every read, never
 * stored: `stalled` in particular is only "claimed, and the lease is in the past", and storing it
 * would need something running on a clock to write it.
 */
export type TaskState = "draft" | "ready" | "blocked" | "claimed" | "stalled" | "done";

/** A hub list's selected scope. The API resolves team slugs to a membership-checked id. */
export type WorkScope = { kind: "all" } | { kind: "mine" } | { kind: "team"; id: string };

function scopedWork(scope: WorkScope, account: string): { sql: string; binds: string[] } {
  if (scope.kind === "mine") return { sql: " AND g.account_id = ?", binds: [account] };
  if (scope.kind === "team") return { sql: " AND g.team_id = ?", binds: [scope.id] };
  return { sql: "", binds: [] };
}

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
 * A screenshot or an upload, in text. `add_file` ends at the same address whichever way the
 * bytes came, so one pattern answers for all of them.
 *
 * Written out here rather than imported from work.ts, which owns the same regex: this module
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
      return "each entry needs `check`: what it is evidence for, in your own words";
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
    // writing work down for as long as that has existed, while an image that is the only
    // possible proof of the agent's OWN claim was never asked for once.
    if (!shown(c)) {
      const line = String(c.check).trim().slice(0, 60);
      return (
        `"${line}" was answered in words. Run it or show it. Run it: send ` +
        `{"check": "${line}", "cmd": "<the command that settles it>"} — it runs here and its ` +
        "output is recorded as the evidence. Show it, when no command can settle it: add_file, then " +
        `{"check": "${line}", "ran": "<the line it returns>"}. Typing a command into \`ran\` is ` +
        "still you typing, and a check that can be neither run nor shown goes in `writeup`."
      );
    }
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
  work_id: string;
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
  /** What had to be adapted, and why. Prose, optional, and shown with the work. */
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

/**
 * The last part of a path, for either kind of separator.
 *
 * A worktree was stored and shown whole, so a claim read "/Users/<login>/Desktop/work/shop" or
 * "C:\\laragon\\www\\khaime": the person's login name and their project layout, in a hub their
 * whole team reads. What tells two checkouts apart is the project's own name.
 */
export const leaf = (path: string) =>
  String(path ?? "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .split("/")
    .pop()!
    .trim();

/** Who is asking, and from where. `agent` is the worktree's stable id. */
export interface Agent {
  account: string;
  agent: string;
  host?: string;
  repo?: string;
  worktree?: string;
  /** Take work from outside the repo it is for. */
  any?: boolean;
}

/**
 * One repo, written one way, so work and the agent asking for it agree on what it is called.
 *
 * A remote URL becomes `owner/repo` whichever form it came in — `git@github.com:o/r.git`,
 * `https://github.com/o/r`, `ssh://git@host/o/r` — because the same repo checked out in two
 * worktrees has two project names and one remote. Anything else is kept as written, lowercase.
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

/** The column work is in. `claim` is null when nobody has taken it. */
export function stateOf(
  work: { status: string; blocked?: number | boolean },
  claim: Pick<ClaimRow, "state" | "lease_until"> | null,
  at: string,
): TaskState {
  if (work.status === "done") return "done";
  if (work.status === "draft") return "draft";
  if (!claim) return work.blocked ? "blocked" : "ready";
  return claim.lease_until > at ? "claimed" : "stalled";
}

const leaseFrom = (at: string, ms = LEASE_MS) => new Date(Date.parse(at) + ms).toISOString();

/**
 * The next generation number for this work. See migrations/0029_claim_fence.sql.
 *
 * Counts up and never goes back, because the counter outlives every claim on that card — the claim
 * row is deleted on release, on pass and on approve, and a number that reset with it would let the
 * same agent's stale write match a later claim. A take that then loses the race burns a number,
 * which costs nothing: what matters is that no number is ever handed out twice.
 */
async function nextFence(db: D1Database, id: string): Promise<number> {
  await db
    .prepare(
      `INSERT INTO claim_fence (work_id, held) VALUES (?, 1)
       ON CONFLICT(work_id) DO UPDATE SET held = held + 1`,
    )
    .bind(id)
    .run();
  const row = await db
    .prepare("SELECT held FROM claim_fence WHERE work_id = ?")
    .bind(id)
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

/** The teams this account owns: the rooms where it may act on anyone's work. */
export async function ownedTeams(db: D1Database, account: string): Promise<Set<string>> {
  const { results } = await db
    .prepare("SELECT team_id FROM membership WHERE account_id = ? AND role = 'owner'")
    .bind(account)
    .all<{ team_id: string }>();
  return new Set(results.map((r) => r.team_id));
}

/**
 * Whoever may move work along: its author, or anyone in its team. A team's board is one board,
 * and everybody on it can mark work ready, stop an agent, or reopen it — the way a card on a shared
 * board is anyone's to move. Deleting and archiving stay with the author or a team owner. Bind ?2.
 */
const MAY_MOVE = `(account_id = ?2 OR (team_id <> '' AND team_id IN
  (SELECT team_id FROM membership WHERE account_id = ?2)))`;

const VISIBLE = `(g.account_id = ?1 OR (g.team_id <> '' AND g.team_id IN
  (SELECT team_id FROM membership WHERE account_id = ?1)))`;

// Somebody else took it, holds it, or finished it, so it is no longer waiting on you. That only
// clears work addressed to more than one person: when a group or a team was asked, one person
// answering is the answer for all of them, and leaving it in everyone else's lane is how two people
// end up doing the same work. Work with your handle on it was asked of you, and nobody else
// answering ends that; nor does it end your own "on it", which is work you still owe. The inbox
// (index.ts) filters on this and every row carries it as `answered_elsewhere`, so the board and the
// lists cannot disagree about it. A claim counts: a teammate's agent holding it is an answer.
export const ANSWERED_ELSEWHERE = `(to_account_id <> ?
  AND (id IN (SELECT work_id FROM proof WHERE account_id <> ?)
       OR id IN (SELECT work_id FROM claim WHERE account_id <> ?)))`;
export const answeredBinds = (account: string) => Array(3).fill(account) as string[];

// Addressed to this account, or to nobody in particular: work assigned to one person or to one
// group is theirs to take, and the queue does not hand it to anyone else's agent.
const FOR_ME = `(g.to_account_id = '' OR g.to_account_id = ?1) AND (g.to_group_id = '' OR
  g.to_group_id IN (SELECT group_id FROM group_member WHERE account_id = ?1))`;

// The question this claim's agent is waiting on a person to answer, or null. Derived, as `stalled`
// is: the latest `asked` since the claim was taken that no `replied` has followed. Nothing moves a
// card to "waiting" and nothing has to move it back. See docs/CONVERSATION.md §4.2.
export const ASKING = `(SELECT e.body FROM task_event e
   WHERE e.work_id = c.work_id AND e.kind = 'asked' AND e.at >= c.claimed_at
     AND NOT EXISTS (SELECT 1 FROM task_event r
                      WHERE r.work_id = e.work_id AND r.kind = 'replied' AND r.id > e.id)
   ORDER BY e.id DESC LIMIT 1)`;

// Waiting on work that is not Done yet. See migrations/0022_blocks.sql.
const BLOCKED = `EXISTS (SELECT 1 FROM task_block b JOIN work x ON x.id = b.blocker_id
  WHERE b.work_id = g.id AND x.status <> 'done')`;

/**
 * Hand this agent new work, or `null` when there is nothing for it.
 *
 * Always new: an agent may hold as much as it can work, and several sessions in one worktree are
 * one agent to the queue, so handing back what it holds would give the second session the first
 * one's work. A restarted session takes its work back by id (`take`), which the session-start hook
 * names. The person watching the board is the limit, not the queue (2026-10-15).
 *
 * Routing: an agent in a repo gets only work for that repo. An agent in no repo gets only work for
 * no repo, because research taken from inside a checkout tends to end with commits in it. `any`
 * lifts both.
 *
 * The claim is an insert that does nothing on conflict, so of two agents racing for one piece of
 * work exactly one changes a row. The loser moves on to the next candidate rather than failing.
 */
export async function next(
  db: D1Database,
  who: Agent,
  { at, any = false, alone = false }: { at: string; any?: boolean; alone?: boolean },
): Promise<{ task: TaskRow; claim: ClaimRow; resumed: boolean } | null> {
  const repo = repoKey(who.repo);
  // `alone`: the runner, with nobody watching, takes only what a person marked safe to run alone.
  const where = `${any ? "" : "AND g.target = ?2"}${alone ? " AND g.alone = 1" : ""}`;
  const { results } = await db
    .prepare(
      `SELECT g.id, g.account_id, g.title, g.status, g.target, g.markdown, g.created
         FROM work g
        WHERE g.status = 'ready' AND ${VISIBLE} AND ${FOR_ME} ${where}
          AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.work_id = g.id) AND NOT ${BLOCKED}
        ORDER BY g.created, g.id LIMIT 20`,
    )
    .bind(...(any ? [who.account] : [who.account, repo]))
    .all<TaskRow>();

  for (const task of results) {
    const lease = leaseFrom(at);
    // Burned when the insert below loses.
    const fence = await nextFence(db, task.id);
    const res = await db
      .prepare(
        `INSERT INTO claim (work_id, account_id, agent_id, host, repo, worktree, state,
                            claimed_at, lease_until, updated, fence)
         VALUES (?, ?, ?, ?, ?, ?, 'claimed', ?, ?, ?, ?)
         ON CONFLICT(work_id) DO NOTHING`,
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

/** The claim on one piece of work, or null. */
export function claimOf(db: D1Database, id: string): Promise<ClaimRow | null> {
  return db.prepare("SELECT * FROM claim WHERE work_id = ?").bind(id).first<ClaimRow>();
}

/** This agent's claim on a piece of work, or null. */
function claimFor(db: D1Database, id: string, who: Agent): Promise<ClaimRow | null> {
  return db
    .prepare("SELECT * FROM claim WHERE work_id = ? AND agent_id = ? AND account_id = ?")
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
  | "reopened"
  | "asked"
  | "replied"
  | "noted"
  // A support request's conversation with its customer (docs/LOOP.md): what the customer wrote,
  // and what a person sent them. Recorded under the work's author for `customer`, because the
  // column must name an account and the customer has none; the hub says it was the customer.
  | "customer"
  | "answered";

/**
 * Tell a parent that a piece of work made from it reached Done (docs/LOOP.md step 3): a note on its thread,
 * which `deliver()` hands to whoever holds it and to whoever takes it next. Once per child — the
 * child's id is in the line and a second call finds it — because several routes can end the same
 * piece of work in one act. Returns whether it wrote. Never throws.
 */
export async function wakeParent(
  db: D1Database,
  child: { id: string; parent_id: string; title: string; outcome: string },
  { account, at }: { account: string; at: string },
): Promise<boolean> {
  try {
    const mark = `(${child.id})`;
    const seen = await db
      .prepare(
        "SELECT 1 FROM task_event WHERE work_id = ? AND kind = 'noted' AND instr(body, ?) > 0",
      )
      .bind(child.parent_id, mark)
      .first();
    if (seen) return false;
    const how = child.outcome === "archived" ? "was closed without being done" : "is done";
    await event(db, child.parent_id, "noted", {
      account,
      body: `"${child.title}" ${mark}, made from this, ${how}.`,
      at,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * A customer wrote again on a support request that is Done, so it is not (docs/LOOP.md): back to
 * Ready, however it reached Done. This is the one way an archived work goes straight to Ready
 * rather than to Draft (`unarchiveProblem`): a Draft reaches nobody, and a customer waiting on an
 * answer is exactly the work that must not be left behind. Only for a piece of work with a customer — the
 * caller has matched the tracking number and the sender. Returns whether it moved.
 */
export async function reopenForCustomer(
  db: D1Database,
  id: string,
  { account, at }: { account: string; at: string },
): Promise<boolean> {
  const g = await db
    .prepare("SELECT markdown FROM work WHERE id = ? AND status = 'done' AND customer <> ''")
    .bind(id)
    .first<{ markdown: string }>();
  if (!g) return false;
  const reason = "The customer wrote again.";
  await db
    .prepare(
      "UPDATE work SET status = 'ready', outcome = '', markdown = ?, updated = ? WHERE id = ?",
    )
    .bind(
      withStatus(withNote(g.markdown, `${at.slice(0, 10)} reopened: ${reason}`), "ready"),
      at,
      id,
    )
    .run();
  await event(db, id, "reopened", { account, body: reason, at });
  return true;
}

/** A note on a piece of work's thread, handed to its holder and next taker. Never throws, as `event`. */
export async function noteOn(
  db: D1Database,
  id: string,
  { account, body, at }: { account: string; body: string; at: string },
): Promise<void> {
  await event(db, id, "noted", { account, body, at });
}

/** One line of a support request's conversation with its customer. Never throws, as `event`. */
export async function customerEvent(
  db: D1Database,
  id: string,
  kind: "customer" | "answered",
  { account, body, at }: { account: string; body: string; at: string },
): Promise<void> {
  await event(db, id, kind, { account, body, at });
}

/**
 * Add one line to a piece of work's thread. Written after the transition it describes has succeeded, never
 * before and never in its place, and it never throws: a thread that loses a bubble is a smaller
 * harm than a hand-in refused because the history could not be written.
 */
export async function event(
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
        `INSERT INTO task_event (work_id, kind, account_id, agent_id, host, body, at)
         SELECT ?, ?, ?, ?, ?, ?, ?
          WHERE (SELECT COUNT(*) FROM task_event WHERE work_id = ?) < ?`,
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
 * This agent takes one piece of work by id: "I am doing this". The same lock as `next`.
 *
 * It is taken once, by one holder. Work that names a repo is taken only from that repo unless
 * `any`; work that names none is taken from anywhere, since asking for it by id is deliberate. A
 * refusal because somebody has it names who, so the agent can say so instead of silently doubling
 * the work.
 *
 * An agent may hold several things at once: taking what it already holds renews it, and taking
 * something else beside it is allowed. Whoever runs the agents watches the board.
 */
export async function take(
  db: D1Database,
  id: string,
  who: Agent,
  {
    at,
    leaseMs = LEASE_MS,
  }: {
    at: string;
    leaseMs?: number;
  },
): Promise<{ task: TaskRow; claim: ClaimRow; resumed: boolean } | Refusal> {
  const g = await db
    .prepare(
      `SELECT g.id, g.account_id, g.title, g.status, g.target, g.markdown, g.created,
              ${BLOCKED} AS blocked, ${FOR_ME} AS for_me
         FROM work g WHERE g.id = ?2 AND ${VISIBLE}`,
    )
    .bind(who.account, id)
    .first<TaskRow & { blocked: number; for_me: number }>();
  if (!g) return { status: 404, error: "no such work that you can see" };

  const held = await db
    .prepare(
      "SELECT work_id FROM claim WHERE agent_id = ? AND account_id = ? AND state = 'claimed' AND work_id = ?",
    )
    .bind(who.agent, who.account, id)
    .first<{ work_id: string }>();
  if (held) {
    const claim = await renew(db, id, who, { at, note: null });
    if (claim) return { task: g, claim, resumed: true };
  }

  if (g.status !== "ready")
    return {
      status: 409,
      error: `${id} is not open to take: it is ${g.status === "draft" ? "a draft" : "done"}`,
    };
  if (!g.for_me)
    return { status: 409, error: `${id} is assigned to someone else — give it to yourself first` };
  if (g.blocked) return { status: 409, error: `${id} waits for work that is not done yet` };
  const repo = repoKey(who.repo);
  if (g.target && !who.any && g.target !== repo)
    return {
      status: 400,
      error: `${id} is for ${g.target}, and this agent is in ${repo || "no repo"}`,
    };

  if (!isPerson(who.agent)) await dropPersonHold(db, id, who.account);
  const fence = await nextFence(db, id);
  const res = await db
    .prepare(
      `INSERT INTO claim (work_id, account_id, agent_id, host, repo, worktree, state,
                          claimed_at, lease_until, updated, fence)
       VALUES (?, ?, ?, ?, ?, ?, 'claimed', ?, ?, ?, ?)
       ON CONFLICT(work_id) DO NOTHING`,
    )
    .bind(
      id,
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
    const claim = await claimFor(db, id, who);
    if (claim) {
      await event(db, id, "taken", { account: who.account, agent: who.agent, host: who.host, at });
      return { task: g, claim, resumed: false };
    }
  }
  const holder = await claimOf(db, id);
  const where = [holder?.host, holder?.worktree].filter(Boolean).join(":");
  return {
    status: 409,
    holder: holder || undefined,
    error: `${id} is already taken${where ? ` by the agent at ${where}` : ""}`,
  };
}

/** Where a held work is: live, or stalled because its agent went quiet. */
export type HeldState = "claimed" | "stalled";

/**
 * Everything somebody is working on right now that this account can see: who has it, where, what
 * they last said. Most recently heard from first.
 */
export async function working(
  db: D1Database,
  account: string,
  at: string,
  scope: WorkScope = { kind: "all" },
): Promise<
  {
    work: {
      id: string;
      title: string;
      /** What it says to a person. */
      summary: string;
      target: string;
      share_key: string;
      account_id: string;
      team_id: string;
    };
    claim: ClaimRow;
    state: HeldState;
    by: { handle: string; name: string; you: boolean };
  }[]
> {
  const scoped = scopedWork(scope, account);
  const { results } = await db
    .prepare(
      `SELECT c.*, g.title AS g_title, g.target AS g_target,
              g.share_key AS g_share_key, g.account_id AS g_account, g.team_id AS g_team,
              g.summary AS g_summary,
              COALESCE(${ASKING}, '') AS asking,
              (SELECT COUNT(*) FROM task_event r
                WHERE r.work_id = c.work_id AND r.kind IN ('replied', 'noted')
                  AND r.id > c.replied_through
                  AND (r.kind = 'noted' OR r.at >= c.claimed_at)) AS waiting_replies,
              COALESCE(a.handle, '') AS by_handle, COALESCE(a.name, '') AS by_name
         FROM claim c
         JOIN work g ON g.id = c.work_id
         LEFT JOIN account a ON a.id = c.account_id
        WHERE c.state = 'claimed' AND ${VISIBLE}${scoped.sql}
        ORDER BY c.lease_until DESC LIMIT 200`,
    )
    .bind(account, ...scoped.binds)
    .all<
      ClaimRow & {
        g_title: string;
        g_target: string;
        g_share_key: string;
        g_account: string;
        g_team: string;
        g_summary: string;
        by_handle: string;
        by_name: string;
      }
    >();
  return results.map(
    ({
      g_title,
      g_target,
      g_share_key,
      g_account,
      g_team,
      g_summary,
      by_handle,
      by_name,
      ...claim
    }) => ({
      work: {
        id: claim.work_id,
        title: g_title,
        summary: g_summary,
        target: g_target,
        share_key: g_share_key,
        account_id: g_account,
        team_id: g_team,
      },
      claim,
      state: claim.lease_until > at ? "claimed" : "stalled",
      by: { handle: by_handle, name: by_name, you: claim.account_id === account },
    }),
  );
}

/**
 * Word from the agent holding work: the lease starts again, and `note` (when given) becomes the
 * line the board shows. Null when this agent does not hold it — including when it once did
 * and a person has since released it, which is the answer an agent needs to stop working.
 *
 * A stalled claim renews like a live one. Stalled only means nobody heard from the agent in time;
 * the agent that took the work is still the one allowed to finish it.
 */
export async function renew(
  db: D1Database,
  id: string,
  who: Agent,
  {
    at,
    note,
    fence,
    leaseMs = LEASE_MS,
  }: { at: string; note: string | null; fence?: number; leaseMs?: number },
): Promise<ClaimRow | null> {
  const res = await db
    .prepare(
      `UPDATE claim SET lease_until = ?, updated = ?, note = COALESCE(?, note)
        WHERE work_id = ? AND agent_id = ? AND account_id = ? AND state = 'claimed'${heldBy(fence)}`,
    )
    .bind(
      leaseFrom(at, leaseMs),
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
        WHERE work_id = ? AND agent_id = ? AND account_id = ? AND state = 'claimed'${heldBy(fence)}`,
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
 * A person writes to whoever holds a piece of work.
 *
 * Not a comment box, and these are the rules that keep it from becoming one: there has to be a
 * holder, because a message with nobody to hear it is a comment; only the people on the asking side
 * may write — the author, whoever it is assigned to, and the holder's own account, which is the
 * common case of somebody replying to their own agent — and not anyone who can read the work; and
 * it is plain text with no edit and no delete. See docs/CONVERSATION.md §2.
 *
 * Does not extend the lease: only the agent speaking does. Returns who holds it, to tell them.
 * Whether the caller can read the work at all is the route's to settle first.
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
    .prepare("SELECT account_id, to_account_id, to_group_id, status FROM work WHERE id = ?")
    .bind(id)
    .first<{ account_id: string; to_account_id: string; to_group_id: string; status: string }>();
  if (!g) return { status: 404, error: "no such work" };
  const { results: held } = await db
    .prepare("SELECT account_id FROM claim WHERE work_id = ? AND state = 'claimed'")
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
  // file the work needs, a thing they thought of after writing it. It is the work's own, not a message
  // to anybody, so it is its own kind and every taker is handed all of it. Done work takes no more.
  const noted = !held.length;
  if (noted && g.status === "done")
    return { status: 409, error: "this is done, so there is nobody to leave a note for" };
  const full = await db
    .prepare("SELECT COUNT(*) AS n FROM task_event WHERE work_id = ?")
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
        "SELECT COALESCE(MAX(id), 0) AS id FROM task_event WHERE work_id = ? AND kind = 'asked' AND at >= ?",
      )
      .bind(id, c.claimed_at)
      .first<{ id: number }>();
    // One below the question, so a reply that came straight after it is still in range.
    if (q?.id) from = Math.min(from, q.id - 1);
  }
  const { results } = await db
    .prepare(
      `SELECT e.id, e.kind, e.at, e.body, e.account_id, COALESCE(a.name, '') AS name,
              COALESCE(a.handle, '') AS handle
         FROM task_event e LEFT JOIN account a ON a.id = e.account_id
        WHERE e.work_id = ? AND e.kind IN ('replied', 'noted', 'customer', 'answered') AND e.id > ?
          AND (e.kind <> 'replied' OR e.at >= ?)
        ORDER BY e.id LIMIT 50`,
    )
    .bind(id, from, c.claimed_at)
    .all<{
      id: number;
      kind: EventKind;
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
          WHERE work_id = ? AND agent_id = ? AND account_id = ?`,
      )
      .bind(last.id, id, who.agent, who.account)
      .run();
  // The customer has no account, so their words are said to be theirs here, and what a person sent
  // them says so: an agent answering a support request needs both, and neither is a person's reply.
  return results.map((r) =>
    r.kind === "customer"
      ? { id: r.id, at: r.at, by: { name: "The customer", handle: "", you: false }, body: r.body }
      : {
          id: r.id,
          at: r.at,
          by: { name: r.name, handle: r.handle, you: r.account_id === who.account },
          body: r.kind === "answered" ? `Sent to the customer: ${r.body}` : r.body,
        },
  );
}

/** A hold nobody has heard from, and who should be told about it. See stalled(). */
export interface Stall {
  work_id: string;
  title: string;
  /** The work's author. */
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
 * It does not release anything. A lapsed lease still holds its card and this does
 * not change that; it only stops the silence being the author's job to notice.
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
      `SELECT c.work_id, c.note, c.lease_until, c.host, c.worktree,
              g.title, g.account_id AS author
         FROM claim c JOIN work g ON g.id = c.work_id
        WHERE c.state = 'claimed' AND c.lease_until <= ?1
          AND (?2 = '' OR c.lease_until > ?2)
        ORDER BY c.lease_until ASC
        LIMIT 200`,
    )
    .bind(at, since)
    .all<{
      work_id: string;
      note: string;
      lease_until: string;
      host: string;
      worktree: string;
      title: string;
      author: string;
    }>();
  return results.map((r) => ({
    work_id: r.work_id,
    title: r.title,
    author: r.author,
    where: [r.host, r.worktree].filter(Boolean).join(":"),
    note: r.note,
    lease_until: r.lease_until,
  }));
}

/** Every piece of work this account can see, with its column and its claim. Oldest first. */
export async function list(
  db: D1Database,
  account: string,
  at: string,
  scope: WorkScope = { kind: "all" },
): Promise<
  {
    task: Omit<TaskRow, "markdown"> & {
      share_key: string;
      /** What it says to a person. Empty on work from before summaries. */
      summary: string;
      for_me: number;
      team_slug: string;
      to_handle: string;
      to_group_slug: string;
      /** The group's name: for several people (`~…`), their `@names`. */
      to_group_name: string;
    };
    claim: ClaimRow | null;
    state: TaskState;
    /** Whose agent has it: a teammate's agent can take your work. Null until one does. */
    by: { handle: string; name: string; you: boolean } | null;
  }[]
> {
  const scoped = scopedWork(scope, account);
  const [tasks, claims] = await Promise.all([
    db
      .prepare(
        `SELECT g.id, g.account_id, g.title, g.summary, g.status, g.target, g.created, g.share_key,
                ${BLOCKED} AS blocked, COALESCE(t.slug, '') AS team_slug,
                (g.to_account_id = ?1 OR (g.to_group_id <> '' AND g.to_group_id IN
                  (SELECT group_id FROM group_member WHERE account_id = ?1))) AS for_me,
                COALESCE(ta.handle, '') AS to_handle, COALESCE(tg.slug, '') AS to_group_slug,
                COALESCE(tg.name, '') AS to_group_name
           FROM work g
           LEFT JOIN team t ON t.id = g.team_id
           LEFT JOIN account ta ON ta.id = g.to_account_id AND g.to_account_id <> ''
           LEFT JOIN team_group tg ON tg.id = g.to_group_id AND g.to_group_id <> ''
          WHERE ${VISIBLE}${scoped.sql} ORDER BY g.created, g.id LIMIT 200`,
      )
      .bind(account, ...scoped.binds)
      .all<
        Omit<TaskRow, "markdown"> & {
          share_key: string;
          summary: string;
          blocked: number;
          for_me: number;
          team_slug: string;
          to_handle: string;
          to_group_slug: string;
          to_group_name: string;
        }
      >(),
    db
      .prepare(
        `SELECT c.*, COALESCE(${ASKING}, '') AS asking,
                COALESCE(a.handle, '') AS by_handle, COALESCE(a.name, '') AS by_name
           FROM claim c
           JOIN work g ON g.id = c.work_id
           LEFT JOIN account a ON a.id = c.account_id
          WHERE ${VISIBLE}`,
      )
      .bind(account)
      .all<ClaimRow & { by_handle: string; by_name: string }>(),
  ]);
  const byTask = new Map(claims.results.map((c) => [c.work_id, c]));
  return tasks.results.map((task) => {
    const claim = byTask.get(task.id) || null;
    return {
      task,
      claim,
      state: stateOf(task, claim, at),
      by: claim
        ? { handle: claim.by_handle, name: claim.by_name, you: claim.account_id === account }
        : null,
    };
  });
}

/** Work this account may move along — its own, or its team's — or a refusal. */
async function movable(
  db: D1Database,
  id: string,
  account: string,
): Promise<{ markdown: string } | { error: string; status: 404 }> {
  const g = await db
    .prepare(`SELECT markdown FROM work WHERE id = ?1 AND ${MAY_MOVE}`)
    .bind(id, account)
    .first<{ markdown: string }>();
  return (
    g || {
      status: 404,
      error: "no such work in your teams — only its author, or someone in its team, takes it back",
    }
  );
}

/** Set `status:` in a document's frontmatter, so the markdown agrees with the column. */
const withStatus = (markdown: string, status: string) =>
  markdown.replace(/^(---\r?\n[\s\S]*?^)status:[^\n]*$/m, `$1status: ${status}`);

/**
 * The end of a hand-in: finishing is final.
 *
 * What was shown is kept as a standing proof, so it is still on the work — first, on its page —
 * after the claim that carried it is gone. The hand-in's claim is let go and the work goes to Done,
 * `outcome = finished`, unless it is Done already (a person said so first).
 */
export async function complete(
  db: D1Database,
  id: string,
  { account, at }: { account: string; at: string },
): Promise<{ done: boolean }> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO proof (work_id, account_id, ok, note, detail, checks, writeup, at)
         SELECT work_id, account_id, ?, note, evidence, checks, writeup, ? FROM claim
          WHERE work_id = ? AND account_id = ? AND state = 'review'
         ON CONFLICT(work_id, account_id) DO UPDATE SET ok = excluded.ok, note = excluded.note,
           detail = excluded.detail, checks = excluded.checks,
           writeup = CASE WHEN excluded.writeup <> '' THEN excluded.writeup ELSE proof.writeup END,
           at = excluded.at`,
      )
      .bind(1, at, id, account),
    db
      .prepare("DELETE FROM claim WHERE work_id = ? AND account_id = ? AND state = 'review'")
      .bind(id, account),
  ]);
  const g = await db
    .prepare("SELECT markdown FROM work WHERE id = ? AND status <> 'done'")
    .bind(id)
    .first<{ markdown: string }>();
  if (!g) return { done: false };
  await db
    .prepare(
      "UPDATE work SET status = 'done', outcome = 'finished', markdown = ?, updated = ? WHERE id = ?",
    )
    .bind(withStatus(g.markdown, "done"), at, id)
    .run();
  return { done: true };
}

/**
 * Put finished work back in To do, with why. Anyone in its team may; the reason
 * goes on the work for whoever takes it next. Only finished work: archived work
 * comes back through Unarchive, to Draft. Returns who finished it, to tell them.
 */
export async function reopen(
  db: D1Database,
  id: string,
  { account, at, why }: { account: string; at: string; why: string },
): Promise<{ finishers: string[] } | { error: string; status: 400 | 404 | 409 }> {
  const reason = String(why ?? "")
    .trim()
    .slice(0, 1000);
  if (!reason) return { status: 400, error: "say why: whoever takes it next reads it first" };
  const g = await db
    .prepare(`SELECT markdown, status, outcome FROM work g WHERE id = ?1 AND ${MAY_MOVE}`)
    .bind(id, account)
    .first<{ markdown: string; status: string; outcome: string }>();
  if (!g) return { status: 404, error: "no such work in your teams" };
  if (g.status !== "done" || g.outcome === "archived")
    return {
      status: 409,
      error:
        g.status === "done"
          ? "it was archived, not finished: unarchive it instead (it goes to Draft)"
          : "it isn't finished, so there is nothing to reopen",
    };
  const markdown = withStatus(
    withNote(g.markdown, `${at.slice(0, 10)} reopened: ${reason}`),
    "ready",
  );
  await db
    .prepare(
      "UPDATE work SET status = 'ready', outcome = '', markdown = ?, updated = ? WHERE id = ?",
    )
    .bind(markdown, at, id)
    .run();
  const { results } = await db
    .prepare("SELECT DISTINCT account_id FROM proof WHERE work_id = ? AND ok = 1")
    .bind(id)
    .all<{ account_id: string }>();
  await event(db, id, "reopened", { account, body: reason, at });
  return { finishers: results.map((r) => r.account_id) };
}

/**
 * A line added to the end of a piece of work, under `## Review notes`, which the next agent reads
 * with the rest of it. The section is made the first time and kept last, so each note goes on its end.
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
 * Somebody in its team takes work back from the agent holding it, live or stalled: it goes back to
 * Ready, and any agent may take it next. The agent that had it hears on its next call that it no
 * longer holds it, and stops.
 *
 * What that agent left behind is often half the job, in a worktree on some machine. So the work
 * says where — host, worktree and its last progress line — and the next agent can go and look
 * rather than start from nothing.
 */
export async function release(
  db: D1Database,
  id: string,
  { account, at }: { account: string; at: string },
): Promise<{ state: "ready"; claimant: string } | { error: string; status: 404 | 409 }> {
  const authored = await movable(db, id, account);
  // Not the author: whoever holds it can still let go of their own hold. Without that, a hold the
  // account could not shed — a stale browser one, say — stood until the author came to remove it.
  const g =
    "error" in authored
      ? await db
          .prepare(
            `SELECT markdown FROM work g WHERE id = ?
                AND EXISTS (SELECT 1 FROM claim WHERE work_id = g.id AND account_id = ? AND state = 'claimed')`,
          )
          .bind(id, account)
          .first<{ markdown: string }>()
      : authored;
  if (!g) return authored as { error: string; status: 404 };

  const c = await db
    .prepare("SELECT * FROM claim WHERE work_id = ? AND state = 'claimed'")
    .bind(id)
    .first<ClaimRow>();
  if (!c) return { status: 409, error: "nobody holds this" };

  // Where the work was left, written into the document so the next person picks it up rather than
  // starting over.
  const where = [c.host, c.worktree].filter(Boolean).join(":") || `agent ${c.agent_id}`;
  const said = c.note ? `; last progress: "${c.note}"` : "";
  const markdown = withNote(g.markdown, `${at.slice(0, 10)} released from ${where}${said}`);
  await db.batch([
    db.prepare("DELETE FROM claim WHERE work_id = ? AND state = 'claimed'").bind(id),
    db.prepare("UPDATE work SET markdown = ?, updated = ? WHERE id = ?").bind(markdown, at, id),
  ]);
  await event(db, id, "released", { account, host: c.host, body: c.note, at });
  return { state: "ready", claimant: c.account_id };
}

/**
 * Set what work waits for, replacing whatever it waited for before. Returns the ids kept.
 *
 * Only work the author can see is kept, and never the work itself: naming someone else's would let
 * a stranger's queue decide when yours moves, and work blocked by itself never moves. Anything else
 * is dropped rather than refused, the way an unresolvable `parent:` is — a `blocked_by:` written
 * against work that was since deleted should not make the document unpublishable by its own author.
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
      .prepare(`SELECT 1 FROM work g WHERE g.id = ?2 AND ${VISIBLE}`)
      .bind(account, b)
      .first();
    if (ok) kept.push(b);
  }
  await db.batch([
    db.prepare("DELETE FROM task_block WHERE work_id = ?").bind(id),
    ...kept.map((b) =>
      db.prepare("INSERT INTO task_block (work_id, blocker_id) VALUES (?, ?)").bind(id, b),
    ),
  ]);
  return kept;
}

/**
 * The agent gives back what it holds: "not me", with the reason. Its claim goes, so the work is
 * open again and the agent is free to take something else.
 *
 * The reason goes into the work under `## Review notes`, with where the agent was, like a release
 * does: the next agent is handed the document, and that is the only place it will look.
 */
export async function pass(
  db: D1Database,
  id: string,
  who: Agent,
  { at, why, fence }: { at: string; why: string; fence?: number },
): Promise<{ author: string } | { error: string; status: 400 | 409 }> {
  const reason = String(why ?? "")
    .trim()
    .slice(0, 1000);
  if (!reason)
    return { status: 400, error: "say why you are passing it, so whoever is next knows" };
  const c = await claimFor(db, id, who);
  // Passing gives the card back, so a stale one would hand back work somebody else is doing.
  if (c && typeof fence === "number" && c.fence !== fence) return { status: 409, error: STALE };
  const g = await db
    .prepare("SELECT account_id, markdown FROM work WHERE id = ?")
    .bind(id)
    .first<{ account_id: string; markdown: string }>();
  if (!c || c.state !== "claimed" || !g)
    return { status: 409, error: "this agent does not hold that — there is nothing to pass" };
  const where = [c.host, c.worktree].filter(Boolean).join(":") || `agent ${c.agent_id}`;
  const markdown = withNote(g.markdown, `${at.slice(0, 10)} passed from ${where}: ${reason}`);
  await db.batch([
    db.prepare("DELETE FROM claim WHERE work_id = ? AND agent_id = ?").bind(id, who.agent),
    db.prepare("UPDATE work SET markdown = ?, updated = ? WHERE id = ?").bind(markdown, at, id),
  ]);
  await event(db, id, "passed", {
    account: who.account,
    agent: who.agent,
    host: c.host,
    body: reason,
    at,
  });
  return { author: g.account_id };
}

/**
 * The agent says it is done: what it did, and what shows it. The claim moves to `review` with
 * that attached, and the route finishes it at once with complete() — nothing reviews it after.
 *
 * `evidence` is required: "done" from the agent that did the work is the one thing nobody else can
 * check. The exception is a person handing in from the browser, who is not pasting a terminal into
 * a page — that path passes `person: true` and is held only to proof a person can look at.
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
    pr = "",
    person = false,
    fence,
  }: {
    at: string;
    note: string;
    evidence: string;
    /** Evidence against each thing checked, with what was run for it. See 0028_evidence_checks.sql. */
    checks?: Check[];
    /**
     * What had to be adapted, and why, in prose. Never required and never refused for its shape: a
     * rule about its length beyond the cap would only teach agents to pad it.
     */
    writeup?: string;
    /** What it could break. See 0032_claim_risk.sql. */
    risk?: string;
    /** A link to the change. */
    pr?: string;
    person?: boolean;
    /** The claim's generation, from take. Checked when it is there. See 0029_claim_fence.sql. */
    fence?: number;
  },
): Promise<{ claim: ClaimRow } | { error: string; status: 400 | 409 }> {
  // Checks are evidence, so a hand-in that brings them has brought it: `evidence` is filled from
  // them rather than asked for twice.
  const said = checks.length ? flatten(checks) : evidence;
  const bad = person
    ? proofProblem(evidence, checks)
    : checks.length
      ? checksProblem(checks)
      : (evidenceProblem(evidence) ?? proofProblem(evidence, checks));
  if (bad) return { status: 400, error: bad };
  const res = await db
    .prepare(
      `UPDATE claim SET state = 'review', evidence = ?, checks = ?, writeup = ?, risk = ?, pr = ?,
              note = COALESCE(NULLIF(?, ''), note), updated = ?
        WHERE work_id = ? AND agent_id = ? AND account_id = ? AND state = 'claimed'${heldBy(fence)}`,
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
              ...(verified(c)
                ? { cmd: String(c.cmd).slice(0, NOTE_MAX), exit: c.exit, ok: c.ok === true }
                : {}),
            })),
          ).slice(0, EVIDENCE_MAX * 2)
        : "",
      String(writeup ?? "")
        .trim()
        .slice(0, WRITEUP_MAX),
      String(risk ?? "")
        .trim()
        .slice(0, NOTE_MAX),
      String(pr ?? "")
        .trim()
        .slice(0, 400),
      String(note ?? "")
        .trim()
        .slice(0, NOTE_MAX),
      at,
      id,
      who.agent,
      who.account,
      ...(typeof fence === "number" ? [fence] : []),
    )
    .run();
  const claim = res.meta.changes === 1 ? await claimFor(db, id, who) : null;
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
  // Two ways to miss, and they read differently to whoever is holding the worktree: the card was
  // taken away, or it was taken away and given back and this write belongs to the claim before.
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
 * What an agent should do next, attached to every answer it gets.
 *
 * Instructions an agent read at the start of a long session are the first thing it forgets; the
 * answer to the call it just made is the last thing it read. So the next move rides on that answer,
 * worked out here because only the server knows the state. `say` is set when the right move is to
 * make no call at all: stop, or tell the person.
 */
export function steps(event: StepEvent, replies = 0): { next: Step[]; say?: string } {
  const working: Step[] = [
    {
      tool: "progress",
      when: "at each milestone, with a one-line note",
      why: "30 minutes without word marks it stalled",
    },
    {
      tool: "hand_in",
      when: "what it asked for holds",
      why:
        "it is finished: it goes to Done with what you showed, and nobody reviews it after you — " +
        "so show it (a screenshot, or the command and its line of output)",
      // Said on every answer, not only once at take: by the time an agent finishes a long piece
      // of work, the rules it read at the start are the first thing gone. Keep evidence collected
      // as you go, or you are reconstructing it from memory at the end, which is the failure this
      // is here to stop.
      with:
        "note: one plain sentence, first person — what you did and how it went. It is the first " +
        "thing the person reads; everything below is behind it. checks: one entry per thing that " +
        "shows it works — what it is, and what you ran for it, or a screenshot. Keep them as you " +
        "go. Anything you had to adapt, and why, goes in `writeup` (500 characters).",
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

/** One line of a piece of work's thread: something an agent or a person did to it, oldest first. */
export interface ThreadItem {
  /** `e<n>`, the recorded event. */
  id: string;
  kind: EventKind;
  at: string;
  /** One line, in the voice of whoever did it. Empty for acts that say everything by themselves. */
  body: string;
  by: { name: string; handle: string; agent: boolean; host: string; you: boolean };
}

/**
 * A piece of work's thread: what happened to it, in order, as the conversation a person would read.
 * `task_event` is the whole of it (migration 0062 moved the older records in).
 *
 * Who may read it is the caller's to settle — this is a query, and the route asks `readableWork`.
 */
export async function thread(db: D1Database, id: string, viewer: string): Promise<ThreadItem[]> {
  const { results } = await db
    .prepare(
      `SELECT e.id, e.kind, e.at, e.body, e.account_id, e.agent_id, e.host,
              COALESCE(a.name, '') AS name, COALESCE(a.handle, '') AS handle
         FROM task_event e LEFT JOIN account a ON a.id = e.account_id
        WHERE e.work_id = ? ORDER BY e.at, e.id LIMIT 500`,
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
  return results.map((e) => ({
    id: `e${e.id}`,
    kind: e.kind,
    at: e.at,
    body: e.body,
    by: {
      name: e.name,
      handle: e.handle,
      agent: Boolean(e.agent_id) && !e.agent_id.startsWith("person-"),
      host: e.host,
      you: e.account_id === viewer,
    },
  }));
}

/**
 * Holds that went quiet and stayed quiet, put back in the queue for anyone to take.
 *
 * `stalled` only says a lease ran out; the card stays held, so work an agent walked away from sat
 * locked until a person noticed and released it — and nothing made sure anyone would. Work being
 * left behind by design is what docs/LOOP.md exists to end, so the clock lets go: once a lease has
 * been out for REQUEUE_AFTER_MS, the hold is deleted exactly as a release deletes it, the work says
 * where it was left, and the thread records it as a release of the holder's own claim carrying
 * REQUEUED — `task_event.account_id` must name an account, and the holder is whose claim went.
 *
 * Not a claim whose agent asked a question nobody has answered: that one is waiting on a person,
 * not gone quiet, and putting it back would hand the question's context to a stranger. Its lease
 * runs out after a day like anything else and the author is told it stalled.
 *
 * The delete checks the lease it read, so an agent that came back between the read and the write
 * keeps its work. `times` counts how often the clock has let go of this work, this one included:
 * a second time means the work is not getting done by whoever picks it up, and a person is told.
 */
export const REQUEUE_AFTER_MS = 2 * 60 * 60 * 1000;

/** The thread's line for a hold the clock let go, and how a requeue is told from a person's release. */
export const REQUEUED = "went quiet; back in the queue";

export async function requeueStalled(
  db: D1Database,
  at: string,
  before: string,
): Promise<{ work_id: string; title: string; author: string; team_id: string; times: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT c.work_id, c.account_id, c.agent_id, c.host, c.worktree, c.note,
              c.lease_until, g.title, g.markdown, g.account_id AS author, g.team_id
         FROM claim c JOIN work g ON g.id = c.work_id
        WHERE c.state = 'claimed' AND c.lease_until <= ? AND ${ASKING} IS NULL
        ORDER BY c.lease_until ASC
        LIMIT 100`,
    )
    .bind(before)
    .all<ClaimRow & { title: string; markdown: string; author: string; team_id: string }>();
  const out = [];
  for (const c of results) {
    const res = await db
      .prepare(
        `DELETE FROM claim WHERE work_id = ? AND account_id = ?
            AND state = 'claimed' AND lease_until = ?`,
      )
      .bind(c.work_id, c.account_id, c.lease_until)
      .run();
    if (res.meta.changes !== 1) continue;
    const where = [c.host, c.worktree].filter(Boolean).join(":") || `agent ${c.agent_id}`;
    const said = c.note ? `; last progress: "${c.note}"` : "";
    await db
      .prepare("UPDATE work SET markdown = ?, updated = ? WHERE id = ?")
      .bind(
        withNote(c.markdown, `${at.slice(0, 10)} went quiet at ${where}${said}; back in the queue`),
        at,
        c.work_id,
      )
      .run();
    await event(db, c.work_id, "released", {
      account: c.account_id,
      agent: c.agent_id,
      host: c.host,
      body: REQUEUED,
      at,
    });
    const n = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM task_event WHERE work_id = ? AND kind = 'released' AND body = ?",
      )
      .bind(c.work_id, REQUEUED)
      .first<{ n: number }>();
    out.push({
      work_id: c.work_id,
      title: c.title,
      author: c.author,
      team_id: c.team_id,
      times: Number(n?.n ?? 1),
    });
  }
  return out;
}

/**
 * Customers left waiting (docs/LOOP.md §4: the team lead is pinged after about four untouched
 * hours). A request is waiting untouched when the customer's latest message has had no answer since
 * and nobody holds the request. Returned in the one run its wait crosses CUSTOMER_WAIT_MS, as
 * `stalled` is, so the team lead hears it once per wait, and again only if the customer writes again
 * and is left again. A request from before customer lines were recorded counts from when it arrived.
 */
export const CUSTOMER_WAIT_MS = 4 * 60 * 60 * 1000;

export async function customersWaiting(
  db: D1Database,
  before: string,
  since: string,
): Promise<{ id: string; title: string; account_id: string; team_id: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT id, title, account_id, team_id FROM (
         SELECT g.id, g.title, g.account_id, g.team_id,
                COALESCE((SELECT MAX(at) FROM task_event e WHERE e.work_id = g.id AND e.kind = 'customer'), g.created) AS wrote
           FROM work g
          WHERE g.customer <> '' AND g.status = 'ready'
            AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.work_id = g.id)
       ) w
       WHERE w.wrote <= ?1 AND w.wrote > ?2
         AND NOT EXISTS (SELECT 1 FROM task_event a WHERE a.work_id = w.id AND a.kind = 'answered' AND a.at >= w.wrote)
       LIMIT 200`,
    )
    .bind(before, since)
    .all<{ id: string; title: string; account_id: string; team_id: string }>();
  return results;
}

/**
 * Work sent to somebody that nothing has happened to, for something on a clock to escalate.
 *
 * "Nothing" is meant strictly: nobody pulled it, nobody said they were taking it, nobody holds it,
 * nobody finished it. Work with any of those is in progress, however slowly. Work for nobody in
 * particular — the whole team — is a backlog, and is not counted.
 *
 * It stays Ready. It used to go back to Draft after a fortnight (`backToDraft`), and a draft reaches
 * nobody: work nobody took was shelved by the product itself, which is the one thing docs/LOOP.md
 * says must never happen. Now a person hears instead — its author and the team's owners, once —
 * and decides: give it to someone else, take it, or archive it.
 *
 * It repeats every day until someone acts (the author's call, docs/LOOP.md §1a): a piece of work is returned
 * in the one run each day that its age crosses UNTAKEN_MS plus a whole number of days. `window` is
 * that run's width; pass one wider than the gap between runs, as `stalled` does. The feed and the
 * phone hear it each day; the mail goes once, because a row coalesces and mail is only its first.
 */
export const UNTAKEN_MS = 3 * 24 * 60 * 60 * 1000;

export const DAY_MS = 24 * 60 * 60 * 1000;

export async function untaken(
  db: D1Database,
  at: string,
  window: number,
): Promise<{ id: string; account_id: string; title: string; team_id: string; to: string }[]> {
  const now = Date.parse(at);
  const before = new Date(now - UNTAKEN_MS).toISOString();
  const { results } = await db
    .prepare(
      `SELECT g.id, g.account_id, g.title, g.team_id, g.to_account_id AS to_id, g.to_group_id,
              g.updated
         FROM work g
        WHERE g.status = 'ready' AND g.updated <= ?1
          AND (g.to_account_id <> '' OR g.to_group_id <> '')
          AND NOT EXISTS (SELECT 1 FROM pull p WHERE p.work_id = g.id AND p.account_id <> g.account_id)
          AND NOT EXISTS (SELECT 1 FROM task_event a WHERE a.work_id = g.id AND a.kind = 'passed')
          AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.work_id = g.id)
          AND NOT EXISTS (SELECT 1 FROM proof v WHERE v.work_id = g.id)
        ORDER BY g.updated ASC
        LIMIT 500`,
    )
    .bind(before)
    .all<{
      id: string;
      account_id: string;
      title: string;
      team_id: string;
      to_id: string;
      to_group_id: string;
      updated: string;
    }>();
  // The run, each day, in which this work's age crossed the threshold plus whole days.
  const due = (updated: string) => (now - Date.parse(updated) - UNTAKEN_MS) % DAY_MS < window;
  return results
    .filter((r) => due(r.updated))
    .map((r) => ({
      id: r.id,
      account_id: r.account_id,
      title: r.title,
      team_id: r.team_id,
      to: r.to_id,
    }));
}

/**
 * How long a piece of work sits untouched in Draft before its author is reminded. Every new work is a
 * draft and only a person's Ready sends it on, so one somebody meant to send and forgot to mark
 * Ready waits forever with nothing saying so.
 */
export const DRAFT_NUDGE_MS = 24 * 60 * 60 * 1000;

/**
 * Drafts whose last edit crossed DRAFT_NUDGE_MS inside (`since`, `before`]: each one is
 * returned in the one run it crosses, as `stalled` does, so this is a reminder and not a nag. An
 * edit moves `updated` forward and the draft crosses again a day later.
 */
export async function staleDrafts(
  db: D1Database,
  before: string,
  since: string,
): Promise<{ id: string; account_id: string; team_id: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT id, account_id, team_id FROM work
        WHERE status = 'draft' AND updated <= ?1 AND updated > ?2
        ORDER BY updated ASC
        LIMIT 200`,
    )
    .bind(before, since)
    .all<{ id: string; account_id: string; team_id: string }>();
  return results;
}

/**
 * After a reassignment: take the work back from everyone the new assignment leaves out. `accounts`
 * is who may hold it now — a person, or a group's members — and null means the whole team, which
 * leaves nobody out. Only a live claim goes. The reason goes under `## Review notes` with where it
 * was, so the next agent can pick up what was started. Returns the account whose hold was dropped,
 * to tell them.
 */
export async function dropOutside(
  db: D1Database,
  id: string,
  { accounts, at, why }: { accounts: string[] | null; at: string; why: string },
): Promise<string[]> {
  if (accounts === null) return [];
  const { results } = await db
    .prepare("SELECT * FROM claim WHERE work_id = ? AND state = 'claimed'")
    .bind(id)
    .all<ClaimRow>();
  const out = results.filter((c) => !accounts.includes(c.account_id));
  if (!out.length) return [];
  const g = await db
    .prepare("SELECT markdown, account_id FROM work WHERE id = ?")
    .bind(id)
    .first<{ markdown: string; account_id: string }>();
  const c = out[0]!;
  const drops = [db.prepare("DELETE FROM claim WHERE work_id = ?").bind(id)];
  if (g) {
    const where = [c.host, c.worktree].filter(Boolean).join(":") || `agent ${c.agent_id}`;
    const markdown = withNote(g.markdown, `${at.slice(0, 10)} ${why}; it was with ${where}`);
    drops.push(
      db.prepare("UPDATE work SET markdown = ?, updated = ? WHERE id = ?").bind(markdown, at, id),
    );
  }
  await db.batch(drops);
  if (g)
    await event(db, id, "released", { account: g.account_id, host: out[0]!.host, body: why, at });
  return [...new Set(out.map((c) => c.account_id))];
}
