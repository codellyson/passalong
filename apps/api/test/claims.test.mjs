// The task queue against a real SQLite, with every migration applied in order.
//
// The claim is only as good as the SQL that takes it, so this runs that SQL rather than a stand-in:
// `node:sqlite` behind a few lines that answer the way D1's prepare/bind/first/all/run do.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ANSWERED_ELSEWHERE,
  ASK_LEASE_MS,
  answeredBinds,
  ask,
  blockOn,
  CUSTOMER_WAIT_MS,
  checksProblem,
  complete,
  customerEvent,
  customersWaiting,
  DAY_MS,
  DRAFT_NUDGE_MS,
  deliver,
  dropOutside,
  evidenceProblem,
  flatten,
  handIn,
  LEASE_MS,
  leaf,
  list,
  next,
  PERSON_LEASE_MS,
  pass,
  proofProblem,
  REQUEUE_AFTER_MS,
  REQUEUED,
  release,
  renew,
  reopen,
  reopenForCustomer,
  reply,
  repoKey,
  requeueStalled,
  staleDrafts,
  stalled,
  stateOf,
  steps,
  take,
  thread,
  UNTAKEN_MS,
  untaken,
  wakeParent,
  working,
} from "../src/claims.ts";
import { feed, line, markRead, notify, unreadCount } from "../src/notify.ts";
import { parseMeta, retiredFields } from "../src/work.ts";

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

/** A database with every migration before the one named, for testing that one on the rows it met. */
function before(prefix) {
  const sql = new DatabaseSync(":memory:");
  const files = readdirSync(MIGRATIONS).sort();
  for (const f of files.slice(
    0,
    files.findIndex((f) => f.startsWith(prefix)),
  ))
    sql.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  return sql;
}

/** Run one migration, by its number. */
const migrate = (sql, prefix) =>
  sql.exec(
    readFileSync(
      join(
        MIGRATIONS,
        readdirSync(MIGRATIONS).find((f) => f.startsWith(prefix)),
      ),
      "utf8",
    ),
  );

const T0 = "2026-09-21T10:00:00.000Z";
const later = (ms) => new Date(Date.parse(T0) + ms).toISOString();

function seed(db) {
  const acct = db.raw.prepare("INSERT INTO account (id, token_hash, created) VALUES (?, ?, ?)");
  for (const id of ["me", "other"]) acct.run(id, `hash-${id}`, T0);
  return (id, { status = "ready", target = "o/r", account = "me", created = T0 } = {}) =>
    db.raw
      .prepare(
        `INSERT INTO work (id, account_id, share_key, title, status, source_context, tags, stack,
                            markdown, created, updated, target)
         VALUES (?, ?, 'k', ?, ?, '', '[]', '[]', '', ?, ?, ?)`,
      )
      .run(id, account, `task ${id}`, status, created, created, target);
}

/** What a hand-in has to bring: the run, not the agent's word for it. */
const PROOF = "npm test -w apps/api → 41 pass, 0 fail";
const A = { account: "me", agent: "agent-a", repo: "o/r" };
const B = { account: "me", agent: "agent-b", repo: "o/r" };

test("hub scope filters work, holds and activity before counting", async () => {
  const db = d1();
  const work = seed(db);
  db.raw.exec(`INSERT INTO team (id, slug, name, created_by, created) VALUES
    ('ta', 'alpha', 'Alpha', 'me', '${T0}'), ('tb', 'beta', 'Beta', 'me', '${T0}');
    INSERT INTO membership (team_id, account_id, joined) VALUES
    ('ta', 'me', '${T0}'), ('tb', 'me', '${T0}');`);
  for (const id of ["personal", "alpha-task", "beta-task"]) work(id);
  db.raw.exec(`UPDATE work SET team_id = 'ta' WHERE id LIKE 'alpha-%';
    UPDATE work SET team_id = 'tb' WHERE id LIKE 'beta-%';`);
  const claim = db.raw.prepare(`INSERT INTO claim
    (work_id, account_id, agent_id, state, claimed_at, lease_until, updated)
    VALUES (?, 'other', ?, ?, ?, ?, ?)`);
  for (const team of ["alpha", "beta"])
    claim.run(`${team}-task`, `${team}-agent`, "claimed", T0, later(LEASE_MS), T0);
  const alpha = { kind: "team", id: "ta" };
  const beta = { kind: "team", id: "tb" };
  assert.deepEqual(
    (await list(db, "me", T0, alpha)).map((r) => r.task.id),
    ["alpha-task"],
  );
  assert.deepEqual(
    (await list(db, "me", T0, beta)).map((r) => r.task.id),
    ["beta-task"],
  );
  assert.deepEqual(
    (await list(db, "me", T0, { kind: "mine" })).map((r) => r.task.id),
    ["alpha-task", "beta-task", "personal"],
  );
  assert.deepEqual(
    (await working(db, "me", T0, alpha)).map((r) => r.work.id),
    ["alpha-task"],
  );

  const notice = db.raw.prepare(`INSERT INTO notification
    (account_id, kind, work_id, team_id, at) VALUES ('me', 'shared', ?, ?, ?)`);
  notice.run("alpha-task", "ta", T0);
  notice.run("beta-task", "tb", later(1));
  const env = { DB: db };
  assert.deepEqual(
    (await feed(env, "me", { scope: alpha })).map((r) => r.work_id),
    ["alpha-task"],
  );
  assert.equal(await unreadCount(env, "me", alpha), 1);
  await markRead(env, "me", undefined, alpha);
  assert.equal(await unreadCount(env, "me", alpha), 0);
  assert.equal(await unreadCount(env, "me", beta), 1, "reading Alpha leaves Beta unread");
});

test("two agents asking at once never get the same task", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
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
  const work = seed(db);
  work("t1", { created: T0 });
  work("t2", { created: later(1) });
  const a = await next(db, A, { at: T0 });
  const b = await next(db, B, { at: T0 });
  assert.equal(a.task.id, "t1");
  assert.equal(b.task.id, "t2");
});

test("an agent goes wide: asking again hands it the next task, never one it holds", async () => {
  // Several sessions in one worktree are one agent to the queue. Handing back what it holds gave
  // the second session the first one's task.
  const db = d1();
  const work = seed(db);
  work("t1", { created: T0 });
  work("t2", { created: later(1) });
  const first = await next(db, A, { at: T0 });
  const second = await next(db, A, { at: later(60_000) });
  assert.deepEqual([first.task.id, second.task.id], ["t1", "t2"]);
  assert.equal(second.resumed, false);
  assert.equal(await next(db, A, { at: later(60_001) }), null, "nothing left to hand out");
  const back = await take(db, "t1", A, { at: later(60_000) });
  assert.equal(back.resumed, true, "its work comes back by id");
  assert.equal(
    back.claim.lease_until,
    later(60_000 + LEASE_MS),
    "taking it again renews the lease",
  );
});

test("a lapsed lease stalls the task and keeps it locked", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await next(db, A, { at: T0 });
  const after = later(LEASE_MS + 1);
  const [row] = await list(db, "me", after);
  assert.equal(row.state, "stalled");
  assert.equal(await next(db, B, { at: after }), null, "nobody else gets a stalled task");
  // The agent that took it can still pick it back up.
  const back = await take(db, "t1", A, { at: after });
  assert.equal(back.task.id, "t1");
  assert.equal(stateOf({ status: "ready" }, back.claim, after), "claimed");
});

test("routing follows the repo, and a task for no repo stays out of every checkout", async () => {
  const db = d1();
  const work = seed(db);
  work("here", { target: "o/r" });
  work("elsewhere", { target: "o/other" });
  work("nowhere", { target: "" });
  assert.equal((await next(db, A, { at: T0 })).task.id, "here");
  assert.equal(await next(db, B, { at: T0 }), null, "o/other and no-repo tasks are not for o/r");
  const loose = { account: "me", agent: "loose", repo: "" };
  assert.equal((await next(db, loose, { at: T0 })).task.id, "nowhere");
  const anyone = { account: "me", agent: "any", repo: "o/r" };
  assert.equal((await next(db, anyone, { at: T0, any: true })).task.id, "elsewhere");
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

test("a task can hand in evidence against each line it was asked for", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await next(db, A, { at: T0 });
  const done = await handIn(db, "t1", A, {
    at: T0,
    note: "done",
    evidence: "",
    checks: [
      {
        check: "the sixth is refused with 429",
        ran: "$ for i in 1..6 → 200 200 200 200 200 429",
        cmd: "./scripts/burst.sh",
        exit: 0,
        ok: true,
      },
      {
        check: "the refusal says when to try again",
        ran: "$ curl -si … → Retry-After: 60",
        cmd: "curl -si localhost:3001/v1/accounts",
        exit: 0,
        ok: true,
      },
    ],
  });
  assert.equal(done.error, undefined);
  assert.deepEqual(JSON.parse(done.claim.checks), [
    {
      check: "the sixth is refused with 429",
      ran: "$ for i in 1..6 → 200 200 200 200 200 429",
      cmd: "./scripts/burst.sh",
      exit: 0,
      ok: true,
    },
    {
      check: "the refusal says when to try again",
      ran: "$ curl -si … → Retry-After: 60",
      cmd: "curl -si localhost:3001/v1/accounts",
      exit: 0,
      ok: true,
    },
  ]);
  // `evidence` is filled from them, so every surface that reads the block of text — the CLI, the
  // handed-in row — keeps working without knowing this column exists.
  assert.match(done.claim.evidence, /the sixth is refused with 429/);
  assert.match(done.claim.evidence, /Retry-After: 60/);
});

test("a check with nothing behind it is not evidence either", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await next(db, A, { at: T0 });
  const fin = (checks) => handIn(db, "t1", A, { at: T0, note: "done", evidence: "", checks });
  assert.match((await fin([{ check: "it works", ran: "" }])).error, /what you ran/i);
  assert.match(
    (await fin([{ check: "", ran: "npm test → 285 pass, 0 fail" }])).error,
    /needs `check`/i,
  );
  assert.match((await fin([{ check: "it works", ran: "yes" }])).error, /what you ran/i);
  assert.equal(await stateIn(db, "t1"), "claimed", "a refused hand-in leaves it held");
});

test("a check a runner executed answers for itself, however short its output", async () => {
  // The length rule exists to catch a sentence standing in for output. `test -f` prints nothing at
  // all and is the strongest evidence on offer, so a run that happened is exempt from it.
  //
  // A command the agent PASTED is not a run that happened. These two are the same string and prove
  // completely different things, and only `cmd` tells them apart, so the pasted one is refused and
  // told to say so properly.
  assert.match(
    checksProblem([{ check: "it builds", ran: "$ test -f dist/app.js" }]) || "",
    /Run it or show it/,
    "pasting a command is still the agent typing",
  );
  assert.match(
    checksProblem([{ check: "it builds", ran: "ok" }]) || "",
    /what you ran and what came back/,
    "prose still has to look like evidence",
  );
  assert.equal(
    checksProblem([
      {
        check: "it builds",
        ran: "$ test -f dist/app.js\n(no output; exited 0)",
        cmd: "test -f dist/app.js",
        exit: 0,
        ok: true,
      },
    ]),
    null,
  );

  // A command that never ran carries exit: null, and is still a check that does not hold.
  assert.match(
    checksProblem([
      { check: "tests pass", ran: "timed out", cmd: "npm test", exit: null, ok: false },
    ]) || "",
    /did not hold/,
  );
  assert.match(
    checksProblem([
      { check: "tests pass", ran: "$ npm test\n1 failing", cmd: "npm test", exit: 1, ok: false },
    ]) || "",
    /a check that failed is not a check that passed/,
  );
});

test("a hand-in records what the command returned, and the flattened block says so", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await next(db, A, { at: T0 });
  const checks = [
    {
      check: "the suite is green",
      ran: "$ npm test\n42 passing",
      cmd: "npm test",
      exit: 0,
      ok: true,
    },
    {
      check: "the badge reads 3",
      ran: "opened the hub by hand, it reads 3 — http://localhost/v1/shots/ab12cd34",
    },
  ];
  const done = await handIn(db, "t1", A, { at: T0, note: "done", evidence: "", checks });
  assert.equal("error" in done, false, done.error);

  const kept = JSON.parse(done.claim.checks);
  assert.equal(kept[0].cmd, "npm test");
  assert.equal(kept[0].exit, 0);
  assert.equal(kept[0].ok, true);
  // The one nobody ran keeps its shape: no command, so nothing to say about a run.
  assert.equal("cmd" in kept[1], false);

  // Every surface older than `checks` reads the flattened block, so the exit code has to be in it.
  assert.match(done.claim.evidence, /\[npm test → exited 0\]/);
  assert.match(flatten(checks), /the badge reads 3\nopened the hub by hand/);
});

test("a stale agent cannot hand in over the card it used to hold", async () => {
  // ABA. `agent_id` is minted per worktree and deliberately stable, so it cannot tell the claim
  // before a release from the claim after one: the same agent takes a task, a person releases it,
  // the same agent takes it again, and a hand-in still in flight from the first claim satisfies
  // the old guard on the second. The generation number is what tells them apart.
  const db = d1();
  const work = seed(db);
  work("t1");

  const first = await next(db, A, { at: T0 });
  const was = first.claim.fence;
  assert.ok(was >= 1, "a fresh claim carries a generation");

  await release(db, "t1", { account: "me", at: T0 });
  const again = await next(db, A, { at: T0 });
  assert.equal(again.claim.work_id, "t1", "the same agent takes it again");
  assert.ok(again.claim.fence > was, `${again.claim.fence} should be past ${was}`);

  // The hand-in the first claim would have sent. Same agent, same account, same task.
  const stale = await handIn(db, "t1", A, {
    at: T0,
    note: "done",
    evidence: PROOF,
    fence: was,
  });
  assert.equal(stale.status, 409);
  assert.match(stale.error, /released and taken again/);
  assert.equal(await stateIn(db, "t1"), "claimed", "the live claim is untouched");

  // The number it holds now works.
  const good = await handIn(db, "t1", A, {
    at: T0,
    note: "done",
    evidence: PROOF,
    fence: again.claim.fence,
  });
  assert.equal("error" in good, false, good.error);
  assert.equal(good.claim.state, "review", "handed in, for complete() to finish");
});

test("the counter outlives the claim, and only ever counts up", async () => {
  // It lives in its own table for this reason: the claim row is deleted on release, on pass and on
  // approve, and a number that went back to zero with it would not be a fence at all.
  const db = d1();
  const work = seed(db);
  work("t1");
  const seen = [];
  for (let i = 0; i < 3; i++) {
    const got = await next(db, A, { at: T0 });
    seen.push(got.claim.fence);
    await release(db, "t1", { account: "me", at: T0 });
  }
  assert.deepEqual(
    seen,
    [...seen].sort((x, y) => x - y),
    "the generations come back in order",
  );
  assert.equal(new Set(seen).size, seen.length, "no generation is handed out twice");
});

test("resuming a claim keeps its generation, and progress renews with it", async () => {
  // A restarted session in the same worktree takes its card back. That is the same claim, so its
  // number must not move — the worktree still holds what it was given.
  const db = d1();
  const work = seed(db);
  work("t1");
  const first = await next(db, A, { at: T0 });
  const resumed = await take(db, "t1", A, { at: T0 });
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.claim.fence, first.claim.fence);

  assert.ok(await renew(db, "t1", A, { at: T0, note: "still here", fence: first.claim.fence }));
  assert.equal(
    await renew(db, "t1", A, { at: T0, note: "stale", fence: first.claim.fence + 1 }),
    null,
    "a number that is not the current one renews nothing",
  );
});

test("a client too old to send a generation still works", async () => {
  // An agent on a CLI from before the migration has no number to send. Refusing it would break
  // every session mid-task on the day this shipped, so it is checked when present and not before.
  const db = d1();
  const work = seed(db);
  work("t1");
  await next(db, A, { at: T0 });
  assert.ok(await renew(db, "t1", A, { at: T0, note: "no number" }));
  const done = await handIn(db, "t1", A, { at: T0, note: "done", evidence: PROOF });
  assert.equal("error" in done, false, done.error);
});

test("a stale agent cannot pass back work somebody else is doing", async () => {
  const db = d1();
  const work = seed(db);
  work("h1", { target: "" });
  // Work sent to someone is not released by its author the way a task is — it is passed back. Same shape:
  // the claim goes away and the same agent can take it again, which is where ABA lives.
  const first = await take(db, "h1", B, { at: T0 });
  await pass(db, "h1", B, { at: T0, why: "wrong repo", fence: first.claim.fence });
  const second = await take(db, "h1", B, { at: T0 });
  assert.equal(second.resumed, false, "the claim went away, so this is a new one");
  assert.ok(second.claim.fence > first.claim.fence);

  const stale = await pass(db, "h1", B, { at: T0, why: "not mine", fence: first.claim.fence });
  assert.equal(stale.status, 409);
  assert.match(stale.error, /released and taken again/);
  const live = await db.prepare("SELECT agent_id FROM claim WHERE work_id = ?").bind("h1").first();
  assert.equal(live?.agent_id, "agent-b", "the live claim is still there");
});

test("work that has gone quiet can be found without a person looking at it", async () => {
  // `stalled` is derived on read and never stored, so until this existed nothing could tell
  // anybody: the state came into being when someone opened the hub, and a card sat held until its
  // author happened to look. This is the read that happens on a clock instead.
  const db = d1();
  const work = seed(db);
  work("t1");
  work("t2");

  const first = await next(db, A, { at: T0 });
  assert.equal(first.task.id, "t1");
  const after = later(LEASE_MS + 1);

  assert.deepEqual(await stalled(db, T0), [], "a live lease is not quiet");
  const quiet = await stalled(db, after);
  assert.equal(quiet.length, 1);
  assert.equal(quiet[0].work_id, "t1");
  assert.equal(quiet[0].author, "me", "the author is who can release it");
  assert.equal(quiet[0].title, "task t1");

  // The last thing it said travels with it: that is what somebody deciding whether to release it
  // actually wants in front of them.
  await renew(db, "t1", A, { at: T0, note: "migrating schema, 2 of 5" });
  const said = await stalled(db, later(LEASE_MS * 2));
  assert.equal(said[0].note, "migrating schema, 2 of 5");

  // A hand-in is waiting on a person, not gone quiet. Its lease lapsing means nothing.
  await handIn(db, "t1", A, { at: T0, note: "done", evidence: PROOF });
  assert.deepEqual(await stalled(db, later(LEASE_MS * 3)), [], "review is not silence");
});

test("a card that has gone quiet is announced once, not on every tick", async () => {
  // Without the window every run returns everything still quiet, and notify() refreshes a repeat's
  // timestamp — so on an hourly cron a card nobody had got to would climb back up the feed every
  // hour, which is how somebody learns to ignore the feed.
  const db = d1();
  const work = seed(db);
  work("t1");
  const held = await next(db, A, { at: T0 });
  const lapsed = Date.parse(held.claim.lease_until);
  const hour = 60 * 60 * 1000;
  const stamp = (ms) => new Date(ms).toISOString();
  const window = (now) => stalled(db, stamp(now), stamp(now - 90 * 60 * 1000));

  // The tick it goes quiet in.
  assert.equal(
    (await window(lapsed + 60_000)).length,
    1,
    "the run it crosses into silence says so",
  );

  // That tick not running — a deploy, an outage — is what the overlap is for: the next one still
  // finds it, because the window reaches back further than the gap between runs.
  assert.equal((await window(lapsed + hour)).length, 1, "a missed tick is covered by the next");

  // After that it is old news, and saying it again is what makes a feed worth ignoring.
  for (const n of [2, 3, 24])
    assert.deepEqual(
      await window(lapsed + n * hour),
      [],
      `still quiet ${n} hours later, and already said once`,
    );

  // Coming back and going quiet again is a second thing happening, and worth a second line.
  const back = stamp(lapsed + 24 * hour);
  assert.ok(await renew(db, "t1", A, { at: back, note: "picked it up again" }));
  const quietAgain = Date.parse(back) + LEASE_MS;
  const again = await window(quietAgain + 60_000);
  assert.equal(again.length, 1, "it went quiet a second time");
  assert.equal(again[0].note, "picked it up again");
  assert.deepEqual(await window(quietAgain + 2 * hour), [], "and is old news again after that");
});

test("only the author takes it back, and only what somebody is holding", async () => {
  const db = d1();
  const work = seed(db);
  work("h1", { target: "" });

  assert.equal((await release(db, "h1", { account: "me", at: T0 })).status, 409, "nobody holds it");
  const ada = { account: "me", agent: "agent-ada", repo: "o/one" };
  await take(db, "h1", ada, { at: T0 });
  assert.equal(
    (await release(db, "h1", { account: "someone-else", at: T0 })).status,
    404,
    "not yours to take back",
  );
  assert.equal((await release(db, "h1", { account: "me", at: T0 })).claimant, "me");
});

// The PR template's Risk: the one part of it a hand-in had no place for. Kept on the claim for the
// reviewer, one line, and optional — never invented when it was not sent.
test("a hand-in can say what it could break", async () => {
  const db = d1();
  const work = seed(db);
  work("h1", { target: "" });
  work("t1");
  const ada = { account: "me", agent: "agent-ada", repo: "o/one" };
  await take(db, "h1", ada, { at: T0 });
  const risky = "changes the shared date helper every report uses";
  const h = await handIn(db, "h1", ada, { at: T0, note: "", evidence: PROOF, risk: risky });
  assert.equal(h.claim.risk, risky);

  await next(db, A, { at: T0 });
  const t = await handIn(db, "t1", A, { at: T0, note: "done", evidence: PROOF });
  assert.equal(t.claim.risk, "", "not sent is empty, not a default");
  assert.equal((await db.prepare("SELECT risk FROM claim WHERE work_id = 't1'").first()).risk, "");
});

test("releasing work writes where it was left", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  const C = { account: "me", agent: "agent-c", repo: "o/r", host: "laptop", worktree: "/src/app" };
  await next(db, C, { at: T0 });
  await renew(db, "t1", C, { at: T0, note: "schema done, routes next" });
  const back = await release(db, "t1", { account: "me", at: T0 });
  assert.equal(back.claimant, "me");
  const md = (await db.prepare("SELECT markdown FROM work WHERE id = ?").bind("t1").first())
    .markdown;
  for (const part of [/Review notes/, /laptop/, /schema done, routes next/]) assert.match(md, part);
});

test("a hand-in answers line by line, each check with what was run for it", async () => {
  // A task has had this since migration 0028. Work sent to someone answered
  // with a boolean and a paragraph, so the expectation was a list and the response was prose. An
  // agent that had read a piece of work and done the work had no shape to fill and no way to tell when it
  // was finished, and improvised: a second published work titled "Hand-in evidence: …", or `pass`
  // with a note. Same field, same column, same rule.
  const db = d1();
  const work = seed(db);
  work("h1", { target: "" });
  const ada = { account: "me", agent: "agent-ada", repo: "o/r" };
  await take(db, "h1", ada, { at: T0 });

  const checks = [
    {
      check: "the sixth request is refused with 429",
      ran: "$ curl -si … → HTTP/1.1 429",
      cmd: "./scripts/burst.sh",
      exit: 0,
      ok: true,
    },
    {
      check: "the retry header names a wait",
      ran: "$ curl -sI … | grep -i retry-after\nRetry-After: 60",
      cmd: "curl -sI localhost:3001/v1/accounts",
      exit: 0,
      ok: true,
    },
  ];
  const done = await handIn(db, "h1", ada, { at: T0, note: "both hold", evidence: "", checks });
  assert.equal("error" in done, false, done.error);

  const kept = JSON.parse(done.claim.checks);
  assert.equal(kept.length, 2);
  assert.equal(kept[0].check, "the sixth request is refused with 429");
  assert.equal(kept[1].cmd, "curl -sI localhost:3001/v1/accounts", "a run check keeps its command");
  assert.equal(kept[1].exit, 0);

  // Every surface older than `checks` reads the flattened block, so it has to be filled from them.
  assert.match(done.claim.evidence, /429/);
  assert.match(done.claim.evidence, /Retry-After/);
});

test("checks on any piece of work are held to the same rule", async () => {
  const db = d1();
  const work = seed(db);
  work("h1", { target: "" });
  const ada = { account: "me", agent: "agent-ada", repo: "o/r" };
  await take(db, "h1", ada, { at: T0 });

  // "it works" under a Verification line is the same claim it always was, filed more neatly.
  const weak = await handIn(db, "h1", ada, {
    at: T0,
    note: "done",
    evidence: "",
    checks: [{ check: "the badge reads 3", ran: "it works" }],
  });
  assert.equal(weak.status, 400);
  assert.match(weak.error, /what you ran and what came back/);
  // The claim's own column, not stateIn(): that reads a task's board position from the work's
  // status, and sent work has no such column.
  const still = await db.prepare("SELECT state FROM claim WHERE work_id = ?").bind("h1").first();
  assert.equal(still.state, "claimed", "a refused hand-in leaves it held");

  // And a check whose command did not hold is not a check that passed.
  const failed = await handIn(db, "h1", ada, {
    at: T0,
    note: "done",
    evidence: "",
    checks: [
      { check: "tests pass", ran: "$ npm test\n1 failing", cmd: "npm test", exit: 1, ok: false },
    ],
  });
  assert.equal(failed.status, 400);
  assert.match(failed.error, /did not hold/);
});

test("a piece of work left in Draft a day is returned once, in the run it crosses", async () => {
  const db = d1();
  const work = seed(db);
  const day = new Date(Date.parse(T0) - DRAFT_NUDGE_MS);
  const at = (ms) => new Date(day.getTime() + ms).toISOString();
  work("forgot", { status: "draft", created: at(-60_000) });
  work("ready", { created: at(-60_000) });
  work("note", { status: "draft", created: at(-60_000) });
  work("shared", { created: at(-60_000) });
  work("fresh", { status: "draft", created: at(60_000) });
  work("older", { status: "draft", created: at(-3 * 60 * 60 * 1000) });

  const window = await staleDrafts(db, day.toISOString(), at(-90 * 60 * 1000));
  assert.deepEqual(
    window.map((g) => g.id),
    ["forgot", "note"],
    "only drafts, of any kind, that crossed a day inside the window",
  );
});

test("a sent work nothing happened to is found each day by the clock; one in play is not", async () => {
  // It stays Ready and a person is told. It used to go back to Draft, where it reached nobody.
  const db = d1();
  const work = seed(db);
  const old = new Date(Date.parse(T0) - UNTAKEN_MS - 60_000).toISOString();
  const sent = (id, over = {}) => {
    work(id, { target: "", created: old, ...over });
    db.raw
      .prepare("UPDATE work SET updated = ?, to_account_id = ? WHERE id = ?")
      .run(old, "other", id);
  };

  sent("untouched");
  sent("pulled");
  sent("passed");
  sent("held");
  sent("judged");
  sent("nobodys"); // addressed to no one at all
  db.raw.prepare("UPDATE work SET to_account_id = '' WHERE id = 'nobodys'").run();
  sent("backlog"); // for the whole team: a backlog, not something sent to anyone
  db.raw.prepare("UPDATE work SET to_account_id = '', team_id = 't' WHERE id = 'backlog'").run();

  db.raw
    .prepare("INSERT INTO pull (work_id, account_id, via, at) VALUES (?, ?, 'cli', ?)")
    .run("pulled", "other", T0);
  db.raw
    .prepare(
      "INSERT INTO task_event (work_id, kind, account_id, body, at) VALUES (?, 'passed', ?, 'not mine', ?)",
    )
    .run("passed", "other", T0);
  db.raw
    .prepare(
      `INSERT INTO claim (work_id, account_id, agent_id, state, claimed_at, lease_until, updated)
       VALUES (?, 'other', 'agent-other', 'claimed', ?, ?, ?)`,
    )
    .run("held", T0, T0, T0);
  db.raw
    .prepare("INSERT INTO proof (work_id, account_id, ok, note, at) VALUES (?, ?, 1, '', ?)")
    .run("judged", "other", T0);

  const HOUR = 60 * 60 * 1000;
  const left = await untaken(db, T0, HOUR);
  assert.deepEqual(
    left.map((g) => g.id).sort(),
    ["untouched"],
    "only the one nobody pulled, passed, took or judged — the rest are conversations in progress",
  );
  assert.equal(left[0].to, "other", "and it knows who it was for");
  assert.equal(left[0].title, "task untouched", "and what it is called, for the mail");

  // Again the next day at the same hour, and not in between: a daily reminder, not an hourly one.
  const day = (n, extra = 0) => new Date(Date.parse(T0) + n * DAY_MS + extra).toISOString();
  assert.deepEqual(
    (await untaken(db, day(1), HOUR)).map((g) => g.id),
    ["untouched"],
    "next day",
  );
  assert.deepEqual(await untaken(db, day(0, 2 * HOUR), HOUR), [], "not two hours later");
  assert.deepEqual(await untaken(db, day(5), HOUR), await untaken(db, day(1), HOUR), "every day");
  const status = db.raw.prepare("SELECT status FROM work WHERE id = 'untouched'").get();
  assert.equal(status.status, "ready", "and it is still Ready, not shelved");
});

test("a hold that stayed quiet goes back in the queue; a second time says it needs a person", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await take(db, "t1", A, { at: T0 });
  await renew(db, "t1", A, { at: T0, note: "halfway" });

  const lapsed = later(LEASE_MS + 1);
  assert.deepEqual(
    await requeueStalled(db, lapsed, new Date(Date.parse(lapsed) - REQUEUE_AFTER_MS).toISOString()),
    [],
    "a lease only just out is left alone: the agent may still come back",
  );

  const at1 = later(LEASE_MS + REQUEUE_AFTER_MS + 1);
  const first = await requeueStalled(
    db,
    at1,
    new Date(Date.parse(at1) - REQUEUE_AFTER_MS).toISOString(),
  );
  assert.equal(first.length, 1);
  assert.equal(first[0].author, "me");
  assert.equal(first[0].times, 1);
  assert.equal(
    db.raw.prepare("SELECT COUNT(*) AS n FROM claim WHERE work_id = 't1'").get().n,
    0,
    "the hold is gone, so anyone may take it",
  );
  const doc = db.raw.prepare("SELECT markdown FROM work WHERE id = 't1'").get().markdown;
  assert.match(doc, /went quiet at .*last progress: "halfway"; back in the queue/);
  assert.equal(
    db.raw.prepare("SELECT body FROM task_event WHERE work_id = 't1' AND kind = 'released'").get()
      .body,
    REQUEUED,
    "the thread says the clock did it",
  );

  // Somebody else takes it and goes quiet too.
  const B = { account: "me", agent: "agent-b", repo: "o/r" };
  const T1 = later(LEASE_MS + REQUEUE_AFTER_MS + 2);
  await take(db, "t1", B, { at: T1 });
  const at2 = new Date(Date.parse(T1) + LEASE_MS + REQUEUE_AFTER_MS + 1).toISOString();
  const second = await requeueStalled(
    db,
    at2,
    new Date(Date.parse(at2) - REQUEUE_AFTER_MS).toISOString(),
  );
  assert.equal(second[0].times, 2, "the second time is the one a person is mailed about");
});

test("a hold waiting on a person's answer is not put back in the queue", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await take(db, "t1", A, { at: T0 });
  await ask(db, "t1", A, { at: later(1000), question: "Settings or the header?" });
  const at = later(ASK_LEASE_MS + REQUEUE_AFTER_MS + 2000);
  assert.deepEqual(
    await requeueStalled(db, at, new Date(Date.parse(at) - REQUEUE_AFTER_MS).toISOString()),
    [],
    "the question would go to a stranger",
  );
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM claim WHERE work_id = 't1'").get().n, 1);
});

test("nothing is handed in without evidence, and a claim is not evidence", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await next(db, A, { at: T0 });
  for (const bad of ["", "   ", "done", "it works", "all good"])
    assert.match(
      evidenceProblem(bad) || "",
      /what you ran and what came back/,
      `"${bad}" is a claim, not evidence`,
    );
  assert.equal(evidenceProblem(PROOF), null);
  assert.equal(evidenceProblem("https://github.com/o/r/pull/12"), null, "a link to the change");

  const missing = await handIn(db, "t1", A, { at: T0, note: "done", evidence: "done" });
  assert.equal(missing.status, 400);
  assert.match(missing.error, /what you ran and what came back/);
  assert.equal(await stateIn(db, "t1"), "claimed", "a refused hand-in leaves it held");

  work("h1", { target: "" });
  await take(db, "h1", B, { at: T0 });
  assert.equal((await handIn(db, "h1", B, { at: T0, note: "worked", evidence: "" })).status, 400);
  const done = await handIn(db, "h1", B, { at: T0, note: "worked", evidence: PROOF });
  assert.equal(done.claim.evidence, PROOF);
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

/** Work t1 that agent A took and handed in. */
async function inReview() {
  const db = d1();
  const work = seed(db);
  work("t1");
  await next(db, A, { at: T0 });
  await handIn(db, "t1", A, { at: T0, note: "done", evidence: PROOF });
  return db;
}

const stateIn = async (db, id, at = T0) =>
  (await list(db, "me", at)).find((r) => r.task.id === id)?.state;

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

test("an agent whose work was released is told to stop", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await next(db, A, { at: T0 });
  await release(db, "t1", { account: "me", at: T0 });
  assert.equal(await renew(db, "t1", A, { at: T0, note: "still going" }), null);
  assert.equal((await handIn(db, "t1", A, { at: T0, note: "done", evidence: PROOF })).status, 409);

  // Taken by someone else since: the first agent cannot finish over the second.
  await next(db, B, { at: T0 });
  assert.equal(await renew(db, "t1", A, { at: T0, note: null }), null);
  assert.equal((await handIn(db, "t1", A, { at: T0, note: "done", evidence: PROOF })).status, 409);
});

test("work waits for the work it is blocked by, until that is Done", async () => {
  const db = d1();
  const work = seed(db);
  work("schema", { created: T0 });
  work("api", { created: later(1) });
  await blockOn(db, "api", ["schema"], { account: "me" });
  assert.equal(await stateIn(db, "api"), "blocked");

  // The only unblocked task goes first, and the blocked one is not handed out behind it.
  assert.equal((await next(db, A, { at: T0 })).task.id, "schema");
  assert.equal(await next(db, B, { at: T0 }), null);

  // Handed in is not yet Done: complete() is what ends it, and only then does it unblock.
  await handIn(db, "schema", A, { at: T0, note: "done", evidence: PROOF });
  assert.equal(await next(db, B, { at: T0 }), null);
  assert.equal(await stateIn(db, "api"), "blocked");

  await complete(db, "schema", { account: "me", at: T0 });
  assert.equal(await stateIn(db, "api"), "ready");
  assert.equal((await next(db, B, { at: T0 })).task.id, "api");
});

test("a task can only be blocked by tasks its author can see, and never by itself", async () => {
  const db = d1();
  const work = seed(db);
  work("mine");
  work("theirs", { account: "other" });
  const kept = await blockOn(db, "mine", ["theirs", "mine", "nosuch"], { account: "me" });
  assert.deepEqual(kept, []);
  assert.equal(await stateIn(db, "mine"), "ready");
});

test("a reason over several lines stays one note in the work", async () => {
  const db = await inReview();
  await complete(db, "t1", { account: "me", at: T0 });
  await reopen(db, "t1", {
    account: "me",
    at: T0,
    why: "Not met: one row per work\nNot met: titles are escaped",
  });
  const back = await next(db, B, { at: T0 });
  const notes = back.task.markdown.split("## Review notes")[1];
  // Every line of it belongs to the one bullet: a line that fell out of the list would read as
  // loose text after it, and the next note would start a second list.
  assert.match(
    notes,
    /\n- 2026-09-21 reopened: Not met: one row per work\n  Not met: titles are escaped\n/,
  );
});

test("a claimed task names the person whose agent has it", async () => {
  const db = d1();
  const work = seed(db);
  db.raw
    .prepare("UPDATE account SET handle = 'ada', name = 'Ada Lovelace' WHERE id = 'other'")
    .run();
  // A teammate's agent can take your task only through a team you share.
  db.raw.exec(`INSERT INTO team (id, slug, name, created_by, created) VALUES ('tm', 'tm', 'T', 'me', '${T0}');
               INSERT INTO membership (team_id, account_id, joined) VALUES ('tm', 'me', '${T0}'), ('tm', 'other', '${T0}');`);
  work("t1");
  work("t2", { created: later(1) });
  db.raw.exec("UPDATE work SET team_id = 'tm'");
  await next(db, { ...A, account: "other" }, { at: T0 });
  const rows = await list(db, "me", T0);
  const t1 = rows.find((r) => r.task.id === "t1");
  assert.deepEqual(t1.by, { handle: "ada", name: "Ada Lovelace", you: false });
  assert.equal(rows.find((r) => r.task.id === "t2").by, null, "nobody has an unclaimed task");
  await next(db, B, { at: T0 });
  const mine = (await list(db, "me", T0)).find((r) => r.task.id === "t2");
  assert.equal(mine.by.you, true);
});

// ---- one claim model for all work ----------------------------------------------

const C = { account: "me", agent: "agent-c", repo: "o/other" };

test("a task has one taker whatever repo the agent is in", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  assert.equal((await take(db, "t1", A, { at: T0 })).claim.agent_id, "agent-a");
  const elsewhere = await take(db, "t1", { ...C, any: true }, { at: T0 });
  assert.equal(elsewhere.status, 409);
  assert.equal(await next(db, C, { at: T0, any: true }), null);
});

test("work taken by id from the wrong repo is refused, and says which repo", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  const wrong = await take(db, "t1", C, { at: T0 });
  assert.equal(wrong.status, 400);
  assert.match(wrong.error, /o\/r/);
  // Work that names no repo is taken by id from anywhere: asking for it by name is deliberate.
  work("loose", { target: "" });
  assert.equal((await take(db, "loose", C, { at: T0 })).claim.repo, "o/other");
  // And it has one holder, wherever the next agent is.
  const second = await take(db, "loose", A, { at: T0 });
  assert.equal(second.status, 409);
  assert.equal(second.holder.agent_id, "agent-c");
});

test("an agent may hold several things, and taking one again resumes it", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  work("h1", { target: "" });
  await take(db, "t1", A, { at: T0 });
  const again = await take(db, "t1", A, { at: later(1) });
  assert.equal(again.resumed, true);
  const other = await take(db, "h1", A, { at: later(2) });
  assert.equal(other.claim.work_id, "h1", "a second thing beside the first");
  assert.equal((await take(db, "t1", A, { at: later(3) })).resumed, true, "the first is still its");
});

test("a draft cannot be taken, and neither can a blocked task", async () => {
  const db = d1();
  const work = seed(db);
  work("d1", { status: "draft" });
  work("t1");
  work("t2", { created: later(1) });
  await blockOn(db, "t2", ["t1"], { account: "me" });
  assert.equal((await take(db, "d1", A, { at: T0 })).status, 409);
  assert.equal((await take(db, "t2", A, { at: T0 })).status, 409);
});

test("working names everything someone holds, with who holds it", async () => {
  const db = d1();
  const work = seed(db);
  db.raw.prepare("UPDATE account SET handle = 'me-h' WHERE id = 'me'").run();
  work("t1");
  work("h1", { target: "" });
  work("b1", { target: "" });
  await take(db, "t1", A, { at: T0 });
  await take(db, "h1", C, { at: T0 });
  const rows = await working(db, "me", later(LEASE_MS + 1));
  assert.deepEqual(rows.map((r) => [r.work.id, r.state]).sort(), [
    ["h1", "stalled"],
    ["t1", "stalled"],
  ]);
  assert.equal(rows[0].by.handle, "me-h");
  assert.equal(rows[0].by.you, true);
});

test("an agent passes what it holds: it is free again, and the work says why for the next agent", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await take(db, "t1", { ...A, host: "mac", worktree: "/w/shop" }, { at: T0 });
  assert.equal((await pass(db, "t1", A, { at: T0, why: "" })).status, 400, "a reason is required");
  const passed = await pass(db, "t1", A, { at: T0, why: "needs a design decision first" });
  assert.equal(passed.author, "me");
  assert.equal(await stateIn(db, "t1"), "ready");
  const md = db.raw.prepare("SELECT markdown FROM work WHERE id = 't1'").get().markdown;
  assert.match(
    md,
    /## Review notes\n- 2026-09-21 passed from mac:\/w\/shop: needs a design decision first/,
  );
  assert.equal(
    (await pass(db, "t1", A, { at: T0, why: "again" })).status,
    409,
    "nothing left to pass",
  );
  assert.equal((await take(db, "t1", B, { at: T0 })).claim.agent_id, "agent-b");
});

test("a fenced hand-in stores its evidence and rejects an older claim generation", async () => {
  const db = d1();
  const work = seed(db);
  work("h1", { target: "" });
  const first = await take(db, "h1", A, { at: T0 });
  await pass(db, "h1", A, { at: T0, why: "try again", fence: first.claim.fence });
  const second = await take(db, "h1", A, { at: T0 });
  const fields = { at: T0, note: "applied", evidence: PROOF, writeup: "needed a local setting" };
  assert.equal((await handIn(db, "h1", A, { ...fields, fence: first.claim.fence })).status, 409);
  assert.equal(await stateIn(db, "h1"), "claimed", "the stale write left the live claim alone");

  const done = await handIn(db, "h1", A, { ...fields, fence: second.claim.fence });
  assert.equal(done.claim.state, "review");
  await complete(db, "h1", { account: "me", at: T0 });
  const saved = db.raw
    .prepare("SELECT ok, note, detail, writeup FROM proof WHERE work_id = 'h1'")
    .get();
  assert.deepEqual(
    { ...saved },
    {
      ok: 1,
      note: "applied",
      detail: PROOF,
      writeup: "needed a local setting",
    },
  );
});

test("every answer says what to do next, and an answer to stop says to stop", () => {
  const tools = (s) => s.next.map((x) => x.tool);
  assert.deepEqual(tools(steps("taken")), ["progress", "hand_in", "pass"]);
  // What to bring rides on every answer, because a rule read at take is forgotten by hand-in.
  for (const event of ["taken", "progress"]) {
    const handIn = steps(event).next.find((x) => x.tool === "hand_in");
    assert.match(handIn.with || "", /checks: one entry per thing/, event);
    assert.match(handIn.with || "", /writeup/, event);
  }
  // Nothing the agent is told names a kind, a section or a piece of work: work is read, not templated.
  const said = JSON.stringify(["taken", "progress", "asked"].map((e) => steps(e)));
  assert.doesNotMatch(said, /Acceptance|Verification|transfer|guide|kind/i);
  assert.deepEqual(tools(steps("handed_in")), ["take"]);
  assert.deepEqual(tools(steps("passed")), ["take"]);
  assert.deepEqual(tools(steps("nothing")), []);
  assert.match(steps("nothing").say, /nothing/i);
  assert.deepEqual(tools(steps("not_held")), []);
  assert.match(steps("not_held").say, /stop/i);
});

// ---- people ------------------------------------------------------------------------------------

const PERSON = { account: "other", agent: "person-other", repo: "" };

function teamed(db) {
  db.raw.exec(`INSERT INTO team (id, slug, name, created_by, created) VALUES ('tm', 'tm', 'T', 'me', '${T0}');
               INSERT INTO membership (team_id, account_id, joined) VALUES ('tm', 'me', '${T0}'), ('tm', 'other', '${T0}');
               UPDATE work SET team_id = 'tm';`);
}

test("a person taking work in the browser can hold several, and is not stalled in half an hour", async () => {
  const db = d1();
  const work = seed(db);
  work("h1", { target: "" });
  work("h2", { target: "" });
  teamed(db);
  const opts = { at: T0, many: true, leaseMs: PERSON_LEASE_MS };
  assert.equal((await take(db, "h1", PERSON, opts)).claim.agent_id, "person-other");
  assert.equal(
    (await take(db, "h2", PERSON, opts)).claim.work_id,
    "h2",
    "a person is not one-at-a-time",
  );
  const rows = await working(db, "me", later(LEASE_MS + 1));
  assert.deepEqual(
    rows.map((r) => r.state),
    ["claimed", "claimed"],
    "still live after 30 minutes",
  );
});

test("an agent takes a task from its own account's browser hold, and can hand it in", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  const mine = { account: "me", agent: "person-me", repo: "", any: true };
  assert.equal((await take(db, "t1", mine, { at: T0, many: true })).claim.agent_id, "person-me");
  const got = await take(db, "t1", A, { at: later(1) });
  assert.equal(got.claim.agent_id, "agent-a", "the browser hold gives way to the agent");
  const done = await handIn(db, "t1", A, {
    at: later(2),
    note: "done",
    evidence: "ran `pnpm test`: 12 passed, 0 failed",
  });
  assert.ok(done.claim, "hand_in is no longer refused");
  assert.equal(done.claim.state, "review");
});

test("a browser hold under any person- id gives way to the account's own agent on a task", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  const mine = { account: "me", agent: "person-someone-else", repo: "", any: true };
  await take(db, "t1", mine, { at: T0, many: true });
  assert.equal((await take(db, "t1", A, { at: later(1) })).claim.agent_id, "agent-a");
});

test("a holder who is not the author can release their own hold, and only theirs", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  teamed(db);
  const t = await take(db, "t1", { ...PERSON, any: true }, { at: T0, many: true });
  assert.ok(t.claim, JSON.stringify(t));
  assert.equal((await release(db, "t1", { account: "stranger", at: later(1) })).status, 404);
  const r = await release(db, "t1", { account: "other", at: later(2) });
  assert.equal(r.state, "ready", JSON.stringify(r));
  assert.equal((await take(db, "t1", A, { at: later(3) })).claim.agent_id, "agent-a");
});

test("anyone in the team can release work a teammate's agent holds", async () => {
  const db = d1();
  const work = seed(db);
  db.raw.exec(
    `INSERT INTO account (id, token_hash, created) VALUES ('mate', 'hash-mate', '${T0}')`,
  );
  for (const id of ["t1", "t2", "t3"]) work(id);
  teamed(db);
  db.raw.exec(
    `INSERT INTO membership (team_id, account_id, joined) VALUES ('tm', 'mate', '${T0}')`,
  );
  const holder = { account: "other", agent: "agent-other1", repo: "o/r" };
  const mate = { account: "mate", at: T0 };

  // Held by a teammate's agent that never handed in: anyone in the team lets go of it, a stranger
  // cannot.
  await take(db, "t1", holder, { at: T0 });
  assert.equal((await release(db, "t1", { account: "stranger", at: T0 })).status, 404);
  const rel = await release(db, "t1", mate);
  assert.equal(rel.state, "ready", JSON.stringify(rel));
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM claim WHERE work_id = 't1'").get().n, 0);
});

// ---- assignment: work for one person, or one group, is theirs to take -------------------------

const OTHER = { account: "other", agent: "agent-other", repo: "o/r" };

test("a task assigned to a person goes only to their agents", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  teamed(db);
  db.raw.exec("UPDATE work SET to_account_id = 'other' WHERE id = 't1'");
  assert.equal(await next(db, A, { at: T0 }), null, "not for me");
  const refused = await take(db, "t1", A, { at: T0 });
  assert.equal(refused.status, 409);
  assert.match(refused.error, /assigned/);
  assert.equal((await next(db, OTHER, { at: T0 })).task.id, "t1");
});

test("a task assigned to a group goes to its members", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  teamed(db);
  db.raw.exec(`INSERT INTO team_group (id, team_id, slug, name, created) VALUES ('g1', 'tm', 'web', 'Web', '${T0}');
               INSERT INTO group_member (group_id, account_id) VALUES ('g1', 'other');
               UPDATE work SET to_group_id = 'g1' WHERE id = 't1';`);
  assert.equal(await next(db, A, { at: T0 }), null);
  assert.equal((await next(db, OTHER, { at: T0 })).task.id, "t1");
});

test("reassigning takes the work back from whoever the new assignment leaves out", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  teamed(db);
  await take(db, "t1", { ...A, host: "mac", worktree: "/w/shop" }, { at: T0 });
  // To `other` alone: my agent's claim goes, with a line saying so for whoever is next.
  const dropped = await dropOutside(db, "t1", {
    accounts: ["other"],
    at: T0,
    why: "reassigned to @ada",
  });
  assert.deepEqual(dropped, ["me"]);
  assert.equal(await stateIn(db, "t1"), "ready");
  const md = db.raw.prepare("SELECT markdown FROM work WHERE id = 't1'").get().markdown;
  assert.match(md, /reassigned to @ada; it was with mac:\/w\/shop/);
  // To the whole team (null): nobody is left out, nothing is dropped.
  await take(db, "t1", OTHER, { at: T0 });
  assert.deepEqual(await dropOutside(db, "t1", { accounts: null, at: T0, why: "x" }), []);
});

test("a hand-in that worked can say what it took, and that is not a new work", async () => {
  // The last of the four channels an agent had to manufacture a piece of work for. `ok` is a boolean,
  // `note` is 280 characters, and `evidence` is refused unless it is what you ran — so an agent
  // that followed a piece of work, landed it, and found that one step needed something the work never
  // mentions had nowhere to put that sentence. It published it: "The email step needs MAIL_FROM
  // and the R2 bucket name", with an id, a share link and an inbox row asking somebody to take it.
  const db = d1();
  const work = seed(db);
  work("h1", { target: "" });
  const ada = { account: "me", agent: "agent-ada", repo: "o/one" };
  await take(db, "h1", ada, { at: T0 });

  const said =
    "Step 4 needed MAIL_FROM and the bucket name; the work assumes both are in wrangler.toml.";
  const done = await handIn(db, "h1", ada, {
    at: T0,
    note: "worked",
    evidence: PROOF,
    writeup: said,
  });
  assert.ok("claim" in done, done.error);
  assert.equal(done.claim.writeup, said, "it lands on the claim, beside the evidence");
  assert.equal(done.claim.evidence, PROOF, "and does not stand in for it");
});

test("a write-up is never what a hand-in is refused for", async () => {
  // It is prose about something nobody can specify in advance. A rule about its length would only
  // teach agents to pad it, and a hand-in with real evidence and nothing to adapt is the common
  // case, not a lapse.
  const db = d1();
  const work = seed(db);
  work("h1", { target: "" });
  const ada = { account: "me", agent: "agent-ada", repo: "o/one" };
  await take(db, "h1", ada, { at: T0 });
  const done = await handIn(db, "h1", ada, { at: T0, note: "worked", evidence: PROOF });
  assert.ok("claim" in done, "no write-up is not a problem");
  assert.equal(done.claim.writeup, "");

  work("h2", { target: "" });
  await take(db, "h2", ada, { at: T0 });
  const thin = await handIn(db, "h2", ada, {
    at: T0,
    note: "worked",
    evidence: "",
    writeup: "a lot",
  });
  assert.equal(thin.status, 400, "and it is not evidence either");
  assert.match(thin.error, /send `evidence`/);
});

test("a check is run or shown, and prose about a picture is neither", async () => {
  // The asymmetry this closes: an image the USER showed an agent has been mandatory before
  // writing work down for as long as that existed — "a screenshot you described instead
  // of attaching is the most useful thing in the report, thrown away" — while an image that is the
  // only possible proof of the agent's OWN claim was never asked for once. So "a Sales Order PDF
  // renders with the store's brand colour" came back as "opened SO-00026, the header bar is
  // #1f6feb", and passed, and nothing in the system had looked at anything.
  const visual = "a Sales Order PDF renders with the store's brand colour";
  const described = checksProblem([
    { check: visual, ran: "Opened SO-00026 in the viewer and the header bar is #1f6feb." },
  ]);
  assert.match(described || "", /Run it or show it/);
  assert.match(described || "", /add_file/, "and it says how");
  assert.match(described || "", /writeup/, "and where a check that is neither belongs");

  // Shown: add_file ends at the same address however the bytes came, so one pattern answers for
  // all of them, and it is the URL that counts rather than the words around it.
  assert.equal(
    checksProblem([
      { check: visual, ran: "the header bar is #1f6feb — http://localhost/v1/shots/ab12cd34" },
    ]),
    null,
  );
  // Run: unchanged, and still exempt from the length rule because an exit code is not prose.
  assert.equal(
    checksProblem([
      { check: visual, ran: "(no output)", cmd: "node scripts/render.mjs", exit: 0, ok: true },
    ]),
    null,
  );

  // A client-internal handle is not a picture anybody else can open — the failure work.ts already
  // refuses at publish, arriving here by the other door.
  assert.match(
    checksProblem([{ check: visual, ran: "here it is: attachment://file_0000abc" }]) || "",
    /Run it or show it/,
  );
});

test("claims.ts and work.ts agree on what a screenshot url looks like", async () => {
  // claims.ts takes no sibling `.ts` import on purpose — it is tested against a real SQLite and
  // Node's type stripping cannot follow a value import — so the pattern is written out twice. A
  // comment saying "same as the other one" does not fail; this does.
  const read = async (f) => await readFile(new URL(`../src/${f}`, import.meta.url), "utf8");
  const [claims, work] = await Promise.all([read("claims.ts"), read("work.ts")]);
  // Compared as text, not as a regex about a regex: the escaping of the second is unreadable and
  // gets in the way of the one thing being checked. In two pieces, because work.ts captures the
  // id and this file only asks whether there is one — that difference is the point of each and is
  // allowed to stay; the address and the shape of an id are what must not drift.
  for (const piece of [String.raw`\/v1\/shots\/`, "[a-z0-9]{6,16}"]) {
    assert.ok(claims.includes(piece), `claims.ts is missing ${piece}`);
    assert.ok(work.includes(piece), `work.ts is missing ${piece}`);
  }
});

test("a thread keeps what progress overwrote and what a release deleted, in order", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await take(db, "t1", A, { at: T0 });
  await renew(db, "t1", A, { at: later(1000), note: "reading the claims code" });
  // No note is a heartbeat, not a thing said: it renews the lease and writes nothing.
  await renew(db, "t1", A, { at: later(2000), note: null });
  await renew(db, "t1", A, { at: later(3000), note: "migration written" });
  await release(db, "t1", { account: "me", at: later(4000) });
  await take(db, "t1", B, { at: later(5000) });
  await handIn(db, "t1", B, { at: later(6000), evidence: PROOF, note: "done" });
  await complete(db, "t1", { account: "me", at: later(6500) });
  await reopen(db, "t1", { account: "me", at: later(7000), why: "the second part is not met" });

  const t = await thread(db, "t1", "me");
  assert.deepEqual(
    t.map((i) => [i.kind, i.body]),
    [
      ["taken", ""],
      ["progress", "reading the claims code"],
      ["progress", "migration written"],
      ["released", "migration written"],
      ["taken", ""],
      ["handed_in", "done"],
      ["reopened", "the second part is not met"],
    ],
  );
  assert.equal(t[0].by.agent, true, "a worktree's act is an agent's");
  assert.equal(t[3].by.agent, false, "the author's own act is not");
  assert.equal(t[3].by.you, true);
  assert.equal((await thread(db, "t1", "other"))[3].by.you, false);
});

test("a thread dies with its work", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await take(db, "t1", A, { at: T0 });
  db.raw.exec("PRAGMA foreign_keys = ON");
  db.raw.prepare("DELETE FROM work WHERE id = 't1'").run();
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM task_event").get().n, 0);
});

test("an agent that asks keeps what it holds, and the card says it is waiting on you", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await take(db, "t1", A, { at: T0 });
  const res = await ask(db, "t1", A, {
    at: later(1000),
    question: "Settings or the header?\nMore context.",
  });
  assert.equal(res.claim.agent_id, "agent-a", "the claim is still its own");
  assert.equal(
    res.claim.note,
    "Settings or the header?",
    "the board's line is the question's first",
  );
  assert.equal(
    res.claim.lease_until,
    later(1000 + ASK_LEASE_MS),
    "a person's answer takes longer than 30 minutes",
  );
  assert.equal(
    (await list(db, "me", later(1000)))[0].claim.asking,
    "Settings or the header?\nMore context.",
  );
  assert.equal(
    (await working(db, "me", later(1000)))[0].claim.asking,
    "Settings or the header?\nMore context.",
  );
  // Nobody else can take it while it waits.
  assert.ok("error" in (await take(db, "t1", B, { at: later(2000) })));
  assert.equal(stateOf({ status: "ready" }, res.claim, later(2000)), "claimed");
  // Answering it clears the waiting, and nothing had to move the card.
  await reply(db, "t1", { account: "me", at: later(3000), body: "Settings." });
  assert.equal((await list(db, "me", later(3000)))[0].claim.asking, "");
});

test("a question is refused when the agent no longer holds it, or holds a newer generation", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  const first = await take(db, "t1", A, { at: T0 });
  assert.equal(
    (await ask(db, "t1", A, { at: T0, question: " " })).status,
    400,
    "an empty question",
  );
  assert.equal((await ask(db, "t1", B, { at: T0, question: "q" })).status, 409, "not its holder");
  await release(db, "t1", { account: "me", at: later(1) });
  const again = await take(db, "t1", A, { at: later(2) });
  assert.ok(again.claim.fence > first.claim.fence);
  const stale = await ask(db, "t1", A, { at: later(3), question: "q", fence: first.claim.fence });
  assert.equal(stale.status, 409);
  assert.match(stale.error, /released and taken again/);
});

test("only the asking side may write, only while somebody holds it, and it is plain text", async () => {
  const db = d1();
  const work = seed(db);
  db.raw
    .prepare("INSERT INTO account (id, token_hash, created) VALUES ('stranger', 'h-s', ?)")
    .run(T0);
  work("t1");
  // Nobody holds it: only its author or whoever it is assigned to may leave a note for whoever takes
  // it, and the rest are told that, not that nobody is listening.
  assert.equal((await reply(db, "t1", { account: "stranger", at: T0, body: "hello" })).status, 403);
  const note = await reply(db, "t1", { account: "me", at: T0, body: "The input is attached." });
  assert.equal(note.noted, true);
  assert.deepEqual(note.holders, [], "there is nobody to tell");
  assert.equal(db.raw.prepare("SELECT kind FROM task_event WHERE kind = 'noted'").all().length, 1);
  await take(db, "t1", A, { at: T0 });
  assert.equal(
    (await reply(db, "t1", { account: "stranger", at: T0, body: "hi" })).status,
    403,
    "not a party",
  );
  assert.equal(
    (await reply(db, "t1", { account: "other", at: T0, body: "hi" })).status,
    403,
    "not a party",
  );
  assert.equal((await reply(db, "t1", { account: "me", at: T0, body: "  " })).status, 400);
  const ok = await reply(db, "t1", {
    account: "me",
    at: later(1),
    body: "<b>use Settings</b>".repeat(100),
  });
  assert.deepEqual(ok.holders, ["me"], "told who holds it");
  const stored = db.raw.prepare("SELECT body FROM task_event WHERE kind = 'replied'").get().body;
  assert.equal(stored.length, 1000, "capped on the server whatever was sent");
  assert.ok(stored.startsWith("<b>"), "kept as text, never turned into anything");

  // Whoever holds it may write to it even when they did not author it: a person replying to the
  // agent they sent, or a teammate who took somebody's work.
  work("t2", { account: "other" });
  db.raw
    .prepare(
      `INSERT INTO claim (work_id, account_id, agent_id, host, repo, worktree, state,
                          claimed_at, lease_until, updated, fence)
       VALUES ('t2', 'me', 'agent-a', '', 'o/r', '', 'claimed', ?, ?, ?, 1)`,
    )
    .run(T0, later(1000), T0);
  assert.ok(
    !("error" in (await reply(db, "t2", { account: "me", at: later(2), body: "ok" }))),
    "the holder",
  );
  assert.ok(
    !("error" in (await reply(db, "t2", { account: "other", at: later(2), body: "ok" }))),
    "the author",
  );
  assert.equal(
    (await reply(db, "t2", { account: "stranger", at: later(2), body: "ok" })).status,
    403,
  );
});

test("a reply reaches the agent once, and a resume hands back what it may have lost", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await take(db, "t1", A, { at: T0 });
  assert.deepEqual(await deliver(db, "t1", A), [], "nothing said yet");
  await ask(db, "t1", A, { at: later(1), question: "which?" });
  await reply(db, "t1", { account: "me", at: later(2), body: "Settings." });
  const got = await deliver(db, "t1", A);
  assert.deepEqual(
    got.map((r) => r.body),
    ["Settings."],
  );
  assert.equal(got[0].by.you, true, "from the same account as the agent");
  assert.deepEqual(await deliver(db, "t1", A), [], "told once");
  // A message with no question before it reaches it too: the composer is not only for answers.
  await reply(db, "t1", { account: "me", at: later(3), body: "Also add a test." });
  assert.deepEqual(
    (await deliver(db, "t1", A)).map((r) => r.body),
    ["Also add a test."],
  );
  // The response was lost, or the session restarted: resuming re-sends everything since the question.
  assert.deepEqual(
    (await deliver(db, "t1", A, { resume: true })).map((r) => r.body),
    ["Settings.", "Also add a test."],
  );
  // Only its own claim moves its cursor.
  assert.deepEqual(await deliver(db, "t1", B), [], "not the holder");
});

test("progress stops being recorded long before a question or a reply is refused room", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await take(db, "t1", A, { at: T0 });
  for (let i = 0; i < 260; i++) await renew(db, "t1", A, { at: later(i), note: `step ${i}` });
  const n = () => db.raw.prepare("SELECT COUNT(*) AS n FROM task_event").get().n;
  assert.equal(n(), 200, "a runaway agent cannot fill a thread");
  await ask(db, "t1", A, { at: later(300), question: "still room for a question?" });
  assert.equal(n(), 201);
  assert.ok(!("error" in (await reply(db, "t1", { account: "me", at: later(301), body: "yes" }))));
});

test("asking is its own ending: stop, and take with the id to carry on", () => {
  const s = steps("asked");
  assert.match(s.say, /Stop here/);
  assert.deepEqual(
    s.next.map((n) => n.tool),
    ["take"],
  );
  assert.match(steps("progress", 2).say, /2 messages/);
  assert.equal(steps("progress").say, undefined);
});

test("your own agent asking you is heard, and nothing else you do to yourself is", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  const env = { DB: db };
  const feed = () =>
    db.raw.prepare("SELECT kind, times, read_at, note FROM notification ORDER BY id").all();

  await notify(env, {
    to: "me",
    kind: "asked",
    work_id: "t1",
    actor_id: "me",
    note: "Settings or header?",
  });
  assert.deepEqual(
    feed().map((r) => r.kind),
    ["asked"],
    "the account that owns the agent is who it is waiting on",
  );
  // The self-drop still holds for everything else: nobody needs telling what they just did.
  await notify(env, { to: "me", kind: "replied", work_id: "t1", actor_id: "me", note: "x" });
  await notify(env, { to: "me", kind: "failed", work_id: "t1", actor_id: "me" });
  assert.equal(feed().length, 1);
  assert.equal(
    line({ kind: "asked", title: "T", times: 1, actor_name: "Ada", note: "Settings?" }),
    'Ada\'s agent has a question about "T": Settings?',
  );
});

test("a second question is unread again, and is mailed only the first time", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  const env = { DB: db };
  let mails = 0;
  const ask1 = (note) =>
    notify(env, {
      to: "me",
      kind: "asked",
      work_id: "t1",
      actor_id: "other",
      note,
      mail: async () => {
        mails++;
        return true;
      },
    });
  await ask1("first");
  db.raw.prepare("UPDATE notification SET read_at = ?").run(T0);
  await ask1("second");
  const [row] = db.raw.prepare("SELECT times, read_at, note FROM notification").all();
  assert.equal(row.times, 2, "coalesced into the one row");
  assert.equal(row.read_at, "", "but new news: it is not marked seen");
  assert.equal(row.note, "second");
  assert.equal(mails, 1, "an inbox is the easiest thing to ruin");
  // Every other kind keeps what it had: a read pull stays read.
  await notify(env, { to: "me", kind: "pulled", work_id: "t1", actor_id: "other" });
  db.raw.prepare("UPDATE notification SET read_at = ? WHERE kind = 'pulled'").run(T0);
  await notify(env, { to: "me", kind: "pulled", work_id: "t1", actor_id: "other" });
  assert.equal(
    db.raw.prepare("SELECT read_at FROM notification WHERE kind = 'pulled'").get().read_at,
    T0,
  );
});

test("a note left before anyone takes it is handed to whoever does, and to the next one too", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await reply(db, "t1", { account: "me", at: T0, body: "Use the staging key." });
  await reply(db, "t1", {
    account: "me",
    at: later(1),
    body: "[spec.pdf](https://p.dev/v1/attachments/abc123xyz)",
  });
  const first = await take(db, "t1", A, { at: later(2) });
  assert.ok(!("error" in first));
  const told = await deliver(db, "t1", A);
  assert.deepEqual(
    told.map((r) => r.body),
    ["Use the staging key.", "[spec.pdf](https://p.dev/v1/attachments/abc123xyz)"],
  );
  assert.deepEqual(await deliver(db, "t1", A), [], "told once");
  // A message to that first agent is not the next agent's to be handed: it was written to somebody.
  await reply(db, "t1", { account: "me", at: later(3), body: "Skip the migration." });
  await release(db, "t1", { account: "me", at: later(4) });
  await take(db, "t1", B, { at: later(5) });
  assert.deepEqual(
    (await deliver(db, "t1", B)).map((r) => r.body),
    ["Use the staging key.", "[spec.pdf](https://p.dev/v1/attachments/abc123xyz)"],
    "the task's own notes travel with it; a reply to the last agent does not",
  );
  // Done work takes no more notes.
  db.raw.prepare("DELETE FROM claim").run();
  db.raw.prepare("UPDATE work SET status = 'done' WHERE id = 't1'").run();
  assert.equal((await reply(db, "t1", { account: "me", at: later(7), body: "more" })).status, 409);
});

test("the session-start hook can see that a person has written", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await take(db, "t1", A, { at: T0 });
  assert.equal((await working(db, "me", T0))[0].claim.waiting_replies, 0);
  await reply(db, "t1", { account: "me", at: later(1), body: "one" });
  await reply(db, "t1", { account: "me", at: later(2), body: "two" });
  assert.equal((await working(db, "me", T0))[0].claim.waiting_replies, 2);
  await deliver(db, "t1", A);
  assert.equal(
    (await working(db, "me", T0))[0].claim.waiting_replies,
    0,
    "told, so no longer waiting",
  );
});

test("a quiet hold stays its agent's when it takes another: the board shows it stalled", async () => {
  // Going wide means nothing is let go behind a person's back; they stop it from the board.
  const db = d1();
  const work = seed(db);
  work("t1");
  work("t2", { created: later(1) });
  await take(db, "t1", A, { at: T0 });
  const moved = await take(db, "t2", A, { at: later(LEASE_MS + 1) });
  assert.equal(moved.claim.work_id, "t2");
  assert.equal(await stateIn(db, "t1", later(LEASE_MS + 2)), "stalled");
});

test("a worktree is shown by its project's name alone, whichever way the path is written", () => {
  assert.equal(leaf("/Users/ada/Desktop/work/shop"), "shop");
  assert.equal(leaf("/home/ada/shop/"), "shop");
  assert.equal(leaf("C:\\laragon\\www\\khaime"), "khaime");
  assert.equal(leaf("shop"), "shop");
  assert.equal(leaf(""), "");
});

test("group members see one answer the same way, and the whole team sees the group's task", async () => {
  const db = d1();
  const work = seed(db);
  const acct = db.raw.prepare("INSERT INTO account (id, token_hash, created) VALUES (?, ?, ?)");
  for (const id of ["bo", "cy"]) acct.run(id, `hash-${id}`, T0);
  db.raw.exec(`INSERT INTO team (id, slug, name, created_by, created) VALUES ('tm', 'tm', 'T', 'me', '${T0}');
    INSERT INTO membership (team_id, account_id, joined) VALUES
      ('tm', 'me', '${T0}'), ('tm', 'other', '${T0}'), ('tm', 'bo', '${T0}'), ('tm', 'cy', '${T0}');
    INSERT INTO team_group (id, team_id, slug, created) VALUES ('fe', 'tm', 'frontend', '${T0}');
    INSERT INTO group_member (group_id, account_id) VALUES ('fe', 'bo'), ('fe', 'cy');`);
  work("g1", { target: "" });
  work("g2", { target: "" });
  work("t1");
  db.raw.exec(`UPDATE work SET team_id = 'tm', to_group_id = 'fe';
    UPDATE work SET to_group_id = '', to_account_id = 'cy' WHERE id = 'g2';`);
  const answered = (account, id) =>
    Boolean(
      db.raw
        .prepare(`SELECT 1 FROM work WHERE id = ? AND ${ANSWERED_ELSEWHERE}`)
        .get(id, ...answeredBinds(account)),
    );

  // Untouched: waiting on both members alike.
  assert.equal(answered("bo", "g1"), false);
  assert.equal(answered("cy", "g1"), false);

  // Bo's agent takes it. It stops waiting on Cy and stays with Bo.
  await take(db, "g1", { account: "bo", agent: "bo-agent", repo: "o/r" }, { at: T0 });
  assert.equal(answered("cy", "g1"), true, "a teammate's agent holds it");
  assert.equal(answered("bo", "g1"), false, "it is Bo's own hold");

  // Named by handle: a teammate answering does not end what was asked of you.
  db.raw.exec(`INSERT INTO proof (work_id, account_id, ok, at) VALUES ('g2', 'bo', 1, '${T0}')`);
  assert.equal(answered("cy", "g2"), false, "asked of Cy by name");
  assert.equal(answered("other", "g2"), true);

  // Everyone in the team sees the group's task; only its members are told it is for them.
  const t1 = async (account) => (await list(db, account, T0)).find((r) => r.task.id === "t1");
  assert.equal(Boolean((await t1("bo")).task.for_me), true);
  assert.equal(Boolean((await t1("cy")).task.for_me), true);
  assert.equal(Boolean((await t1("other")).task.for_me), false, "on the board, not for them");
});

test("several people read as their names, and a draft's publish says where Ready is", async () => {
  const db = d1();
  const work = seed(db);
  work("pair");
  db.raw.exec(`INSERT INTO team (id, slug, name, created_by, created) VALUES ('ta', 'alpha', 'Alpha', 'me', '${T0}');
    INSERT INTO membership (team_id, account_id, joined) VALUES ('ta', 'me', '${T0}');
    INSERT INTO team_group (id, team_id, slug, name, created) VALUES ('g1', 'ta', '~cda71730db', '@ada, @bola', '${T0}');
    UPDATE work SET team_id = 'ta', to_group_id = 'g1' WHERE id = 'pair';`);
  const row = (await list(db, "me", T0)).find((r) => r.task.id === "pair");
  assert.equal(row.task.to_group_slug, "~cda71730db");
  assert.equal(
    row.task.to_group_name,
    "@ada, @bola",
    "the names, which the route says as @ada @bola",
  );

  // The routes are not importable (see hosts.ts), so the rest is held to the source.
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.match(src, /r\.task\.to_group_name\.split\(\/,\\s\*\/\)\.join\(" "\)/);
  assert.match(
    src,
    /ready_at: `\$\{base\}\/hub\/w\/\$\{id\}`/,
    "a draft's publish names its hub page",
  );
});

test("archiving lets go of everyone on it, and the ones already stuck are cleared", async () => {
  // The route is not importable (see hosts.ts), so it is held to the rule by its source.
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const route = src.slice(src.indexOf('app.patch("/v1/work/:id/status"'));
  const archiving = route.slice(
    route.indexOf('if (status === "done") {'),
    route.indexOf("UPDATE work SET status"),
  );
  assert.match(archiving, /DELETE FROM claim WHERE work_id = \?/, "archiving clears its claims");
});

test("finishing needs something a person can look at, unless checks answer for themselves", () => {
  assert.equal(proofProblem("![works](https://passalong.dev/v1/shots/d2eg7b2xaqx7)", []), null);
  assert.equal(proofProblem("$ npm test\n41 pass, 0 fail", []), null, "a command and its line");
  assert.equal(proofProblem("npm test → 41 pass, 0 fail", []), null);
  assert.equal(proofProblem("ran `pnpm test`: 12 passed, 0 failed", []), null);
  assert.match(proofProblem("I checked it and it works fine now", []), /show it/);
  assert.equal(proofProblem("", [{ check: "x", cmd: "true", exit: 0, ok: true }]), null);
});

test("a hand-in is final: Done, with what was shown kept, and Reopen puts it back", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await take(db, "t1", A, { at: T0 });
  await handIn(db, "t1", A, { at: later(1), evidence: PROOF, note: "done" });
  assert.deepEqual(await complete(db, "t1", { account: "me", at: later(2) }), { done: true });
  const g = () => db.raw.prepare("SELECT status, outcome FROM work WHERE id = 't1'").get();
  assert.deepEqual({ ...g() }, { status: "done", outcome: "finished" });
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM claim").get().n, 0, "nothing left waiting");
  const shown = db.raw.prepare("SELECT ok, detail FROM proof WHERE work_id = 't1'").get();
  assert.deepEqual({ ...shown }, { ok: 1, detail: PROOF }, "the proof stays on the work");

  assert.equal((await reopen(db, "t1", { account: "me", at: later(3), why: "" })).status, 400);
  const back = await reopen(db, "t1", { account: "me", at: later(4), why: "the header overlaps" });
  assert.deepEqual(back.finishers, ["me"], "whoever finished it is told");
  assert.deepEqual({ ...g() }, { status: "ready", outcome: "" }, "back in To do");
  assert.equal((await reopen(db, "t1", { account: "me", at: later(5), why: "x" })).status, 409);

  work("shelf", { status: "done" });
  db.raw.exec("UPDATE work SET outcome = 'archived' WHERE id = 'shelf'");
  const shelf = await reopen(db, "shelf", { account: "me", at: later(6), why: "x" });
  assert.match(shelf.error, /unarchive it instead/, "archived is not finished");
});

test("an agent holding a support request hears what the customer said and what they were sent", async () => {
  const db = d1();
  const work = seed(db);
  work("t1");
  await customerEvent(db, "t1", "customer", { account: "me", body: "Export does nothing", at: T0 });
  await take(db, "t1", A, { at: later(1000) });
  await customerEvent(db, "t1", "answered", {
    account: "me",
    body: "Looking now.",
    at: later(2000),
  });
  const heard = await deliver(db, "t1", A);
  assert.deepEqual(
    heard.map((r) => [r.by.name, r.body]),
    [
      ["The customer", "Export does nothing"],
      [heard[1].by.name, "Sent to the customer: Looking now."],
    ],
    "what the customer wrote before it was taken still reaches whoever takes it",
  );
  assert.equal(heard[0].by.you, false);
  assert.deepEqual(await deliver(db, "t1", A), [], "and each is said once");
});

test("a finished child wakes its parent once, and says when it was closed undone instead", async () => {
  const db = d1();
  const work = seed(db);
  work("parent");
  work("fix");
  const child = { id: "fix", parent_id: "parent", title: "Fix export", outcome: "finished" };
  assert.equal(await wakeParent(db, child, { account: "me", at: T0 }), true);
  assert.equal(
    await wakeParent(db, child, { account: "me", at: later(1000) }),
    false,
    "a second route ending the same child says nothing new",
  );
  const notes = db.raw
    .prepare("SELECT body FROM task_event WHERE work_id = 'parent' AND kind = 'noted'")
    .all();
  assert.deepEqual(
    notes.map((n) => n.body),
    ['"Fix export" (fix), made from this, is done.'],
  );

  work("dropped");
  await wakeParent(
    db,
    { id: "dropped", parent_id: "parent", title: "Try a workaround", outcome: "archived" },
    { account: "me", at: T0 },
  );
  // Whoever takes the parent next is handed both, the way any note reaches a taker.
  await take(db, "parent", A, { at: later(2000) });
  assert.deepEqual(
    (await deliver(db, "parent", A)).map((r) => r.body),
    [
      '"Fix export" (fix), made from this, is done.',
      '"Try a workaround" (dropped), made from this, was closed without being done.',
    ],
  );
});

test("a customer writing again puts their request back in Ready, even from archived", async () => {
  const db = d1();
  const work = seed(db);
  work("req", { status: "done" });
  work("plain", { status: "done" });
  db.raw.exec(`UPDATE work SET outcome = 'archived' WHERE id IN ('req', 'plain');
    UPDATE work SET customer = 'jane@example.com', ref = 'R-K7Q2M9' WHERE id = 'req';`);
  assert.equal(await reopenForCustomer(db, "req", { account: "me", at: T0 }), true);
  const row = db.raw.prepare("SELECT status, outcome, markdown FROM work WHERE id = 'req'").get();
  assert.equal(row.status, "ready", "Ready, not Draft: a draft reaches nobody");
  assert.equal(row.outcome, "");
  assert.match(row.markdown, /reopened: The customer wrote again/);
  assert.equal(
    await reopenForCustomer(db, "plain", { account: "me", at: T0 }),
    false,
    "only a piece of work with a customer: everything else unarchives to Draft as before",
  );
  assert.equal(await reopenForCustomer(db, "req", { account: "me", at: T0 }), false, "once");
});

test("the runner is handed only tasks a person marked safe to run alone", async () => {
  const db = d1();
  const work = seed(db);
  work("plain");
  work("marked");
  db.raw.prepare("UPDATE work SET alone = 1 WHERE id = 'marked'").run();
  const runner = { account: "me", agent: "agent-runner", repo: "o/r" };
  const got = await next(db, runner, { at: T0, alone: true });
  assert.equal(got?.task.id, "marked");
  assert.equal(await next(db, runner, { at: T0, alone: true }), null, "nothing else is safe");
  const person = { account: "me", agent: "agent-person", repo: "o/r" };
  assert.equal((await next(db, person, { at: T0 }))?.task.id, "plain", "a person still gets any");
});

test("a customer left four hours with no answer is found once; answered or held is not", async () => {
  const db = d1();
  const work = seed(db);
  for (const id of ["wait", "done", "held", "plain"]) work(id);
  db.raw.prepare("UPDATE work SET customer = 'c@x.test' WHERE id <> 'plain'").run();
  for (const id of ["wait", "done", "held"])
    await customerEvent(db, id, "customer", { account: "me", body: "Help", at: T0 });
  await customerEvent(db, "done", "answered", { account: "me", body: "On it", at: later(1000) });
  await take(db, "held", A, { at: later(1000) });
  const at = (ms) => {
    const now = Date.parse(T0) + ms;
    return [
      new Date(now - CUSTOMER_WAIT_MS).toISOString(),
      new Date(now - CUSTOMER_WAIT_MS - 60 * 60 * 1000).toISOString(),
    ];
  };
  const ids = async (ms) => (await customersWaiting(db, ...at(ms))).map((g) => g.id);
  assert.deepEqual(await ids(CUSTOMER_WAIT_MS - 1000), [], "not before four hours");
  assert.deepEqual(await ids(CUSTOMER_WAIT_MS + 1000), ["wait"]);
  assert.deepEqual(await ids(CUSTOMER_WAIT_MS + 2 * 60 * 60 * 1000), [], "once per wait");
  await customerEvent(db, "wait", "customer", {
    account: "me",
    body: "Hello?",
    at: later(5 * 3600e3),
  });
  assert.deepEqual(await ids(9 * 3600e3 + 1000), ["wait"], "writing again starts a new wait");
});
