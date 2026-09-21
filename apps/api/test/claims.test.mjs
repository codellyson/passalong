// The task queue against a real SQLite, with every migration applied in order.
//
// The claim is only as good as the SQL that takes it, so this runs that SQL rather than a stand-in:
// `node:sqlite` behind a few lines that answer the way D1's prepare/bind/first/all/run do.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  approve,
  blockOn,
  finish,
  LEASE_MS,
  list,
  next,
  reject,
  release,
  renew,
  repoKey,
  stateOf,
} from "../src/claims.ts";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** An empty database with the schema production has, shaped like a D1 binding. */
function d1() {
  const sql = new DatabaseSync(":memory:");
  for (const f of readdirSync(MIGRATIONS).sort())
    sql.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  const db = {
    raw: sql,
    prepare(q) {
      const stmt = sql.prepare(q);
      const bound = (args) => ({
        first: async () => stmt.get(...args) ?? null,
        all: async () => ({ results: stmt.all(...args) }),
        run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
      });
      return { ...bound([]), bind: (...args) => bound(args) };
    },
    // D1 runs a batch as one transaction: all of it lands or none of it does.
    async batch(stmts) {
      sql.exec("BEGIN");
      try {
        const out = [];
        for (const st of stmts) out.push(await st.run());
        sql.exec("COMMIT");
        return out;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return db;
}

const T0 = "2026-09-21T10:00:00.000Z";
const later = (ms) => new Date(Date.parse(T0) + ms).toISOString();

function seed(db) {
  const acct = db.raw.prepare("INSERT INTO account (id, token_hash, created) VALUES (?, ?, ?)");
  for (const id of ["me", "other"]) acct.run(id, `hash-${id}`, T0);
  return (
    id,
    { status = "published", target = "o/r", kind = "task", account = "me", created = T0 } = {},
  ) =>
    db.raw
      .prepare(
        `INSERT INTO guide (id, account_id, share_key, title, status, source_context, tags, stack,
                            markdown, created, updated, kind, target)
         VALUES (?, ?, 'k', ?, ?, '', '[]', '[]', '', ?, ?, ?, ?)`,
      )
      .run(id, account, `task ${id}`, status, created, created, kind, target);
}

const A = { account: "me", agent: "agent-a", repo: "o/r" };
const B = { account: "me", agent: "agent-b", repo: "o/r" };

test("two agents asking at once never get the same task", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  // SQLite here answers synchronously, so two calls cannot interleave on their own. Force the
  // worst ordering instead: B reads the queue, then A claims, then B tries to insert what it read.
  let raced = false;
  const racing = {
    prepare(q) {
      const p = db.prepare(q);
      if (!/NOT EXISTS \(SELECT 1 FROM claim/.test(q)) return p;
      return {
        bind: (...args) => ({
          all: async () => {
            const read = await p.bind(...args).all();
            if (!raced) {
              raced = true;
              assert.equal((await next(db, A, { at: T0 })).task.id, "t1");
            }
            return read;
          },
        }),
      };
    },
  };
  assert.equal(
    await next(racing, B, { at: T0 }),
    null,
    "B read t1 as free, and still did not get it",
  );
  assert.equal(raced, true);
  const [row] = await list(db, "me", T0);
  assert.equal(row.claim.agent_id, "agent-a");
});

test("the loser of a race moves on to the next task", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1", { created: T0 });
  guide("t2", { created: later(1) });
  const a = await next(db, A, { at: T0 });
  const b = await next(db, B, { at: T0 });
  assert.equal(a.task.id, "t1");
  assert.equal(b.task.id, "t2");
});

test("an agent holds one task, and asking again hands it back", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1", { created: T0 });
  guide("t2", { created: later(1) });
  const first = await next(db, A, { at: T0 });
  const again = await next(db, A, { at: later(60_000) });
  assert.equal(again.task.id, first.task.id);
  assert.equal(again.resumed, true);
  assert.equal(again.claim.lease_until, later(60_000 + LEASE_MS), "asking again renews the lease");
});

test("a lapsed lease stalls the task and keeps it locked", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  await next(db, A, { at: T0 });
  const after = later(LEASE_MS + 1);
  const [row] = await list(db, "me", after);
  assert.equal(row.state, "stalled");
  assert.equal(await next(db, B, { at: after }), null, "nobody else gets a stalled task");
  // The agent that took it can still pick it back up.
  const back = await next(db, A, { at: after });
  assert.equal(back.task.id, "t1");
  assert.equal(stateOf({ status: "published" }, back.claim, after), "claimed");
});

test("routing follows the repo, and a task for no repo stays out of every checkout", async () => {
  const db = d1();
  const guide = seed(db);
  guide("here", { target: "o/r" });
  guide("elsewhere", { target: "o/other" });
  guide("nowhere", { target: "" });
  assert.equal((await next(db, A, { at: T0 })).task.id, "here");
  assert.equal(await next(db, B, { at: T0 }), null, "o/other and no-repo tasks are not for o/r");
  const loose = { account: "me", agent: "loose", repo: "" };
  assert.equal((await next(db, loose, { at: T0 })).task.id, "nowhere");
  const anyone = { account: "me", agent: "any", repo: "o/r" };
  assert.equal((await next(db, anyone, { at: T0, any: true })).task.id, "elsewhere");
});

test("drafts, other people's tasks and non-tasks are never handed out", async () => {
  const db = d1();
  const guide = seed(db);
  guide("draft", { status: "draft" });
  guide("theirs", { account: "other" });
  guide("transfer", { kind: "" });
  assert.equal(await next(db, A, { at: T0 }), null);
});

test("progress renews the lease only for the agent holding the task", async () => {
  const db = d1();
  seed(db)("t1");
  await next(db, A, { at: T0 });
  const r = await renew(db, "t1", A, { at: later(5_000), note: "migrating schema, 2/5" });
  assert.equal(r.note, "migrating schema, 2/5");
  assert.equal(r.lease_until, later(5_000 + LEASE_MS));
  assert.equal(await renew(db, "t1", B, { at: later(5_000), note: "mine now" }), null);
  // A progress call with no note keeps the last line rather than blanking it.
  assert.equal(
    (await renew(db, "t1", A, { at: later(6_000), note: null })).note,
    "migrating schema, 2/5",
  );
});

test("finishing needs a transfer guide, and moves the task to review", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  guide("report", { kind: "", target: "" });
  guide("theirs", { kind: "", target: "", account: "other" });
  await next(db, A, { at: T0 });
  assert.equal((await finish(db, "t1", A, { at: T0, report: "missing" })).status, 400);
  assert.equal((await finish(db, "t1", A, { at: T0, report: "theirs" })).status, 400);
  assert.equal(
    (await finish(db, "t1", A, { at: T0, report: "t1" })).status,
    400,
    "a task is not a report",
  );
  assert.equal((await finish(db, "t1", B, { at: T0, report: "report" })).status, 409);
  await renew(db, "t1", A, { at: T0, note: "all green" });
  const done = await finish(db, "t1", A, { at: T0, report: "report", pr: "https://x/pull/1" });
  assert.equal(done.claim.state, "review");
  assert.equal(done.claim.note, "all green", "finishing without a note keeps the last line");
  const [row] = (await list(db, "me", T0)).filter((r) => r.task.id === "t1");
  assert.equal(row.state, "review");
  assert.equal(row.claim.report_id, "report");
  // Finished is not held: the agent is free for the next one, and this task is not handed out again.
  assert.equal(await next(db, A, { at: T0 }), null);
});

test("a repo is one name however it was written", () => {
  for (const raw of [
    "git@github.com:Owner/Repo.git",
    "https://github.com/owner/repo",
    "https://github.com/owner/repo.git/",
    "ssh://git@github.com/owner/repo",
    "owner/repo",
  ])
    assert.equal(repoKey(raw), "owner/repo", raw);
  assert.equal(repoKey("passalong"), "passalong");
  assert.equal(repoKey(""), "");
});

/** A task t1 that agent A took and finished with a transfer guide called "report". */
async function inReview() {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  guide("report", { kind: "", target: "" });
  await next(db, A, { at: T0 });
  await finish(db, "t1", A, { at: T0, report: "report" });
  return db;
}

const stateIn = async (db, id, at = T0) =>
  (await list(db, "me", at)).find((r) => r.task.id === id)?.state;

test("approving a task in review makes it done", async () => {
  const db = await inReview();
  const r = await approve(db, "t1", { account: "me", at: later(1_000) });
  assert.equal(r.error, undefined);
  assert.equal(await stateIn(db, "t1"), "done");
});

test("only the author approves, and only a task in review", async () => {
  const db = await inReview();
  assert.equal((await approve(db, "t1", { account: "other", at: T0 })).status, 404);
  assert.equal(await stateIn(db, "t1"), "review");

  const db2 = d1();
  seed(db2)("t2");
  await next(db2, A, { at: T0 });
  assert.equal(
    (await approve(db2, "t2", { account: "me", at: T0 })).status,
    409,
    "still being worked on",
  );
});

test("rejecting sends the task back to Ready, and the next agent reads why", async () => {
  const db = await inReview();
  const r = await reject(db, "t1", {
    account: "me",
    at: later(1_000),
    why: "dark mode ignores the OS setting",
  });
  assert.equal(r.error, undefined);
  assert.equal(await stateIn(db, "t1"), "ready");
  const again = await next(db, B, { at: later(2_000) });
  assert.equal(again.task.id, "t1", "rejected work is back in the queue for anyone");
  assert.match(again.task.markdown, /dark mode ignores the OS setting/);
});

test("a rejection needs a reason, the author, and a task in review", async () => {
  const db = await inReview();
  assert.equal((await reject(db, "t1", { account: "me", at: T0, why: "  " })).status, 400);
  assert.equal((await reject(db, "t1", { account: "other", at: T0, why: "no" })).status, 404);
  assert.equal(await stateIn(db, "t1"), "review");
  const db2 = d1();
  seed(db2)("t2");
  await next(db2, A, { at: T0 });
  assert.equal((await reject(db2, "t2", { account: "me", at: T0, why: "no" })).status, 409);
});

test("releasing a stalled task puts it back, pointing at the work left behind", async () => {
  const db = d1();
  seed(db)("t1");
  const C = {
    account: "me",
    agent: "agent-c",
    repo: "o/r",
    host: "laptop",
    worktree: "/src/shop-dark",
  };
  await next(db, C, { at: T0 });
  await renew(db, "t1", C, { at: T0, note: "theme tokens done, toggle next" });
  const after = later(LEASE_MS + 1);
  assert.equal(await stateIn(db, "t1", after), "stalled");

  const r = await release(db, "t1", { account: "me", at: after });
  assert.equal(r.error, undefined);
  assert.equal(await stateIn(db, "t1", after), "ready");
  const taken = await next(db, B, { at: after });
  assert.equal(taken.task.id, "t1");
  for (const part of [/laptop/, /\/src\/shop-dark/, /theme tokens done, toggle next/])
    assert.match(taken.task.markdown, part);
});

test("a live claim can be released too, but not a task nobody holds", async () => {
  const db = d1();
  seed(db)("t1");
  assert.equal(
    (await release(db, "t1", { account: "me", at: T0 })).status,
    409,
    "ready: nobody holds it",
  );
  await next(db, A, { at: T0 });
  assert.equal((await release(db, "t1", { account: "other", at: T0 })).status, 404);
  assert.equal((await release(db, "t1", { account: "me", at: T0 })).error, undefined);
  assert.equal(await stateIn(db, "t1"), "ready");
});

test("an agent whose task was released or rejected is told to stop", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  guide("report", { kind: "", target: "" });
  await next(db, A, { at: T0 });
  await release(db, "t1", { account: "me", at: T0 });
  assert.equal(await renew(db, "t1", A, { at: T0, note: "still going" }), null);
  assert.equal((await finish(db, "t1", A, { at: T0, report: "report" })).status, 409);

  // Rejected, then taken by someone else: the first agent cannot finish over the second.
  await next(db, A, { at: T0 });
  await finish(db, "t1", A, { at: T0, report: "report" });
  await reject(db, "t1", { account: "me", at: T0, why: "wrong" });
  await next(db, B, { at: T0 });
  assert.equal(await renew(db, "t1", A, { at: T0, note: null }), null);
  assert.equal((await finish(db, "t1", A, { at: T0, report: "report" })).status, 409);
});

test("a task in review lists the title of the write-up it came back with", async () => {
  const db = await inReview();
  const [row] = (await list(db, "me", T0)).filter((r) => r.task.id === "t1");
  assert.equal(row.report_title, "task report");
  const [waiting] = (await list(db, "me", T0)).filter((r) => r.task.id === "report");
  assert.equal(waiting, undefined, "the write-up is not a task");
});

test("a task waits for the tasks it is blocked by, until a person approves them", async () => {
  const db = d1();
  const guide = seed(db);
  guide("schema", { created: T0 });
  guide("api", { created: later(1) });
  guide("report", { kind: "", target: "" });
  await blockOn(db, "api", ["schema"], { account: "me" });
  assert.equal(await stateIn(db, "api"), "blocked");

  // The only unblocked task goes first, and the blocked one is not handed out behind it.
  assert.equal((await next(db, A, { at: T0 })).task.id, "schema");
  assert.equal(await next(db, B, { at: T0 }), null);

  // Finished is not enough: an agent saying it is done does not unblock anything.
  await finish(db, "schema", A, { at: T0, report: "report" });
  assert.equal(await next(db, B, { at: T0 }), null);
  assert.equal(await stateIn(db, "api"), "blocked");

  await approve(db, "schema", { account: "me", at: T0 });
  assert.equal(await stateIn(db, "api"), "ready");
  assert.equal((await next(db, B, { at: T0 })).task.id, "api");
});

test("a task can only be blocked by tasks its author can see, and never by itself", async () => {
  const db = d1();
  const guide = seed(db);
  guide("mine");
  guide("theirs", { account: "other" });
  const kept = await blockOn(db, "mine", ["theirs", "mine", "nosuch"], { account: "me" });
  assert.deepEqual(kept, []);
  assert.equal(await stateIn(db, "mine"), "ready");
});

test("a reason over several lines stays one note in the task", async () => {
  const db = await inReview();
  await reject(db, "t1", {
    account: "me",
    at: T0,
    why: "Not met: one row per guide\nNot met: titles are escaped",
  });
  const back = await next(db, B, { at: T0 });
  const notes = back.task.markdown.split("## Review notes")[1];
  // Every line of it belongs to the one bullet: a line that fell out of the list would read as
  // loose text after it, and the next note would start a second list.
  assert.match(
    notes,
    /\n- 2026-09-21 rejected: Not met: one row per guide\n  Not met: titles are escaped\n/,
  );
});

test("a claimed task names the person whose agent has it", async () => {
  const db = d1();
  const guide = seed(db);
  db.raw.prepare("UPDATE account SET handle = 'ada', name = 'Ada Lovelace' WHERE id = 'other'").run();
  // A teammate's agent can take your task only through a team you share.
  db.raw.exec(`INSERT INTO team (id, slug, name, created_by, created) VALUES ('tm', 'tm', 'T', 'me', '${T0}');
               INSERT INTO membership (team_id, account_id, joined) VALUES ('tm', 'me', '${T0}'), ('tm', 'other', '${T0}');`);
  guide("t1");
  guide("t2", { created: later(1) });
  db.raw.exec("UPDATE guide SET team_id = 'tm'");
  await next(db, { ...A, account: "other" }, { at: T0 });
  const rows = await list(db, "me", T0);
  const t1 = rows.find((r) => r.task.id === "t1");
  assert.deepEqual(t1.by, { handle: "ada", name: "Ada Lovelace", you: false });
  assert.equal(rows.find((r) => r.task.id === "t2").by, null, "nobody has an unclaimed task");
  await next(db, B, { at: T0 });
  const mine = (await list(db, "me", T0)).find((r) => r.task.id === "t2");
  assert.equal(mine.by.you, true);
});
