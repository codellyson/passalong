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
  ASK_LEASE_MS,
  approve,
  archivesAt,
  ask,
  blockOn,
  checksProblem,
  closeGuide,
  deliver,
  dropOutside,
  evidenceProblem,
  finish,
  flatten,
  handedIn,
  handIn,
  LEASE_MS,
  leaf,
  list,
  markDone,
  next,
  PERSON_LEASE_MS,
  pass,
  reject,
  release,
  renew,
  reply,
  repoKey,
  STALE_SENT_MS,
  sendBackHandedIn,
  staleSent,
  stalled,
  stateOf,
  steps,
  take,
  thread,
  working,
} from "../src/claims.ts";
import { line, notify } from "../src/notify.ts";

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

/** What a hand-in has to bring: the run, not the agent's word for it. */
const PROOF = "npm test -w apps/api → 41 pass, 0 fail";
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
  const fin = (o) => finish(db, "t1", A, { at: T0, evidence: PROOF, report: "report", ...o });
  assert.equal((await fin({ report: "missing" })).status, 400);
  assert.equal((await fin({ report: "theirs" })).status, 400);
  assert.equal((await fin({ report: "t1" })).status, 400, "a task is not a report");
  assert.equal(
    (await finish(db, "t1", B, { at: T0, evidence: PROOF, report: "report" })).status,
    409,
  );
  await renew(db, "t1", A, { at: T0, note: "all green" });
  const done = await fin({ pr: "https://x/pull/1" });
  assert.equal(done.claim.state, "review");
  assert.equal(done.claim.note, "all green", "finishing without a note keeps the last line");
  assert.equal(done.claim.evidence, PROOF, "what it ran is kept with the claim");
  const [row] = (await list(db, "me", T0)).filter((r) => r.task.id === "t1");
  assert.equal(row.state, "review");
  assert.equal(row.claim.report_id, "report");
  // Finished is not held: the agent is free for the next one, and this task is not handed out again.
  assert.equal(await next(db, A, { at: T0 }), null);
});

test("a task can hand in evidence against each line it was asked for", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  guide("report", { kind: "", target: "" });
  await next(db, A, { at: T0 });
  const done = await finish(db, "t1", A, {
    at: T0,
    report: "report",
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
  const guide = seed(db);
  guide("t1");
  guide("report", { kind: "", target: "" });
  await next(db, A, { at: T0 });
  const fin = (checks) => finish(db, "t1", A, { at: T0, report: "report", evidence: "", checks });
  assert.match((await fin([{ check: "it works", ran: "" }])).error, /what you ran/i);
  assert.match(
    (await fin([{ check: "", ran: "npm test → 285 pass, 0 fail" }])).error,
    /which check/i,
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
  const guide = seed(db);
  guide("t1");
  guide("report", { kind: "", target: "" });
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
  const done = await finish(db, "t1", A, { at: T0, report: "report", evidence: "", checks });
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
  const guide = seed(db);
  guide("t1");
  guide("report", { kind: "", target: "" });

  const first = await next(db, A, { at: T0 });
  const was = first.claim.fence;
  assert.ok(was >= 1, "a fresh claim carries a generation");

  await release(db, "t1", { account: "me", at: T0 });
  const again = await next(db, A, { at: T0 });
  assert.equal(again.claim.guide_id, "t1", "the same agent takes it again");
  assert.ok(again.claim.fence > was, `${again.claim.fence} should be past ${was}`);

  // The hand-in the first claim would have sent. Same agent, same account, same task.
  const stale = await finish(db, "t1", A, {
    at: T0,
    report: "report",
    evidence: PROOF,
    fence: was,
  });
  assert.equal(stale.status, 409);
  assert.match(stale.error, /released and taken again/);
  assert.equal(await stateIn(db, "t1"), "claimed", "the live claim is untouched");

  // The number it holds now works.
  const good = await finish(db, "t1", A, {
    at: T0,
    report: "report",
    evidence: PROOF,
    fence: again.claim.fence,
  });
  assert.equal("error" in good, false, good.error);
  assert.equal(await stateIn(db, "t1"), "review");
});

test("the counter outlives the claim, and only ever counts up", async () => {
  // It lives in its own table for this reason: the claim row is deleted on release, on pass and on
  // approve, and a number that went back to zero with it would not be a fence at all.
  const db = d1();
  const guide = seed(db);
  guide("t1");
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
  const guide = seed(db);
  guide("t1");
  const first = await next(db, A, { at: T0 });
  const resumed = await next(db, A, { at: T0 });
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
  const guide = seed(db);
  guide("t1");
  guide("report", { kind: "", target: "" });
  await next(db, A, { at: T0 });
  assert.ok(await renew(db, "t1", A, { at: T0, note: "no number" }));
  const done = await finish(db, "t1", A, { at: T0, report: "report", evidence: PROOF });
  assert.equal("error" in done, false, done.error);
});

test("a stale agent cannot pass back work somebody else is doing", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  // A handoff is not released by its author the way a task is — it is passed back. Same shape:
  // the claim goes away and the same agent can take it again, which is where ABA lives.
  const first = await take(db, "h1", B, { at: T0 });
  await pass(db, "h1", B, { at: T0, why: "wrong repo", fence: first.claim.fence });
  const second = await take(db, "h1", B, { at: T0 });
  assert.equal(second.resumed, false, "the claim went away, so this is a new one");
  assert.ok(second.claim.fence > first.claim.fence);

  const stale = await pass(db, "h1", B, { at: T0, why: "not mine", fence: first.claim.fence });
  assert.equal(stale.status, 409);
  assert.match(stale.error, /released and taken again/);
  const live = await db.prepare("SELECT agent_id FROM claim WHERE guide_id = ?").bind("h1").first();
  assert.equal(live?.agent_id, "agent-b", "the live claim is still there");
});

test("work that has gone quiet can be found without a person looking at it", async () => {
  // `stalled` is derived on read and never stored, so until this existed nothing could tell
  // anybody: the state came into being when someone opened the hub, and a card sat held until its
  // author happened to look. This is the read that happens on a clock instead.
  const db = d1();
  const guide = seed(db);
  guide("t1");
  guide("t2");
  guide("report", { kind: "", target: "" });

  const first = await next(db, A, { at: T0 });
  assert.equal(first.task.id, "t1");
  const after = later(LEASE_MS + 1);

  assert.deepEqual(await stalled(db, T0), [], "a live lease is not quiet");
  const quiet = await stalled(db, after);
  assert.equal(quiet.length, 1);
  assert.equal(quiet[0].guide_id, "t1");
  assert.equal(quiet[0].author, "me", "the author is who can release it");
  assert.equal(quiet[0].title, "task t1");

  // The last thing it said travels with it: that is what somebody deciding whether to release it
  // actually wants in front of them.
  await renew(db, "t1", A, { at: T0, note: "migrating schema, 2 of 5" });
  const said = await stalled(db, later(LEASE_MS * 2));
  assert.equal(said[0].note, "migrating schema, 2 of 5");

  // A hand-in is waiting on a person, not gone quiet. Its lease lapsing means nothing.
  await finish(db, "t1", A, { at: T0, report: "report", evidence: PROOF });
  assert.deepEqual(await stalled(db, later(LEASE_MS * 3)), [], "review is not silence");
});

test("a card that has gone quiet is announced once, not on every tick", async () => {
  // Without the window every run returns everything still quiet, and notify() refreshes a repeat's
  // timestamp — so on an hourly cron a card nobody had got to would climb back up the feed every
  // hour, which is how somebody learns to ignore the feed.
  const db = d1();
  const guide = seed(db);
  guide("t1");
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

test("an author takes a handoff back from everyone holding it", async () => {
  // It was tasks only, which left an asymmetry nobody chose: a task you could reclaim, a handoff
  // you could not. The author's only ways out were `close` — which marks it done, and it is not —
  // or assigning it to a third party, which takes it back as a side effect of giving it away.
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });

  // A handoff has one claim per repo, so several people can hold it at once and each is right to.
  const ada = { account: "me", agent: "agent-ada", repo: "o/one" };
  const bo = { account: "me", agent: "agent-bo", repo: "o/two" };
  assert.equal((await take(db, "h1", ada, { at: T0 })).resumed, false);
  assert.equal((await take(db, "h1", bo, { at: T0 })).resumed, false);
  assert.equal((await working(db, "me", T0)).length, 2, "both hold it");

  const back = await release(db, "h1", { account: "me", at: T0 });
  assert.equal("error" in back, false, back.error);
  assert.deepEqual(back.claimants, ["me"], "whoever had it, told once each");
  assert.equal(back.places, 2, "and two claims went, which is a different number");
  assert.equal(back.state, "ready");
  assert.deepEqual(await working(db, "me", T0), [], "taken back from everyone, not just the first");

  // And it is open again, to them or anyone else.
  assert.equal((await take(db, "h1", ada, { at: T0 })).resumed, false, "free to take again");
});

test("only the author takes it back, and only what somebody is holding", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  guide("report", { kind: "", target: "" });

  assert.equal((await release(db, "h1", { account: "me", at: T0 })).status, 409, "nobody holds it");
  const ada = { account: "me", agent: "agent-ada", repo: "o/one" };
  await take(db, "h1", ada, { at: T0 });
  assert.equal(
    (await release(db, "h1", { account: "someone-else", at: T0 })).status,
    404,
    "not yours to take back",
  );

  // Handed in is waiting on the author, not being worked on: approving or sending it back is the
  // answer, and taking it back would throw away the evidence somebody just wrote up.
  await handIn(db, "h1", ada, { at: T0, note: "done", evidence: PROOF });
  const held = await release(db, "h1", { account: "me", at: T0 });
  assert.equal(held.status, 409);
  assert.match(held.error, /handed in and waiting on you/);
});

// The PR template's Risk: the one part of it a hand-in had no place for. Kept on the claim for the
// reviewer, one line, and optional — never invented when it was not sent.
test("a hand-in can say what it could break, on a handoff and a task alike", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  guide("t1");
  guide("report", { kind: "", target: "" });
  const ada = { account: "me", agent: "agent-ada", repo: "o/one" };
  await take(db, "h1", ada, { at: T0 });
  const risky = "changes the shared date helper every report uses";
  const h = await handIn(db, "h1", ada, { at: T0, note: "", evidence: PROOF, risk: risky });
  assert.equal(h.claim.risk, risky);

  await next(db, A, { at: T0 });
  const t = await finish(db, "t1", A, { at: T0, report: "report", evidence: PROOF });
  assert.equal(t.claim.risk, "", "not sent is empty, not a default");
  assert.equal((await db.prepare("SELECT risk FROM claim WHERE guide_id = 't1'").first()).risk, "");
});

test("releasing a task still writes where the work was left", async () => {
  // The task path is unchanged: `## Review notes` is a task's section, and a handoff has no place
  // for one — inventing a section inside somebody's published guide is not release's business.
  const db = d1();
  const guide = seed(db);
  guide("t1");
  const C = { account: "me", agent: "agent-c", repo: "o/r", host: "laptop", worktree: "/src/app" };
  await next(db, C, { at: T0 });
  await renew(db, "t1", C, { at: T0, note: "schema done, routes next" });
  const back = await release(db, "t1", { account: "me", at: T0 });
  assert.deepEqual(back.claimants, ["me"]);
  const md = (await db.prepare("SELECT markdown FROM guide WHERE id = ?").bind("t1").first())
    .markdown;
  for (const part of [/Review notes/, /laptop/, /schema done, routes next/]) assert.match(md, part);

  guide("h2", { kind: "transfer", target: "" });
  await take(db, "h2", C, { at: T0 });
  await release(db, "h2", { account: "me", at: T0 });
  const hmd = (await db.prepare("SELECT markdown FROM guide WHERE id = ?").bind("h2").first())
    .markdown;
  assert.doesNotMatch(hmd, /Review notes/, "a handoff's document is left alone");
});

test("a handoff answers its Verification line by line, the way a task answers Acceptance", async () => {
  // A task has had this since migration 0028. A handoff — the product's main artifact — answered
  // with a boolean and a paragraph, so the expectation was a list and the response was prose. An
  // agent that had read a guide and done the work had no shape to fill and no way to tell when it
  // was finished, and improvised: a second published guide titled "Hand-in evidence: …", or `pass`
  // with a note. Same field, same column, same rule.
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
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

test("a handoff's checks are held to the same rule as a task's", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
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
  // The claim's own column, not stateIn(): that reads a task's board position from the guide's
  // status, and a handoff has no such column.
  const still = await db.prepare("SELECT state FROM claim WHERE guide_id = ?").bind("h1").first();
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

test("a sent guide nothing happened to is closed by the clock; one in play is not", async () => {
  // Leaving `Open` needs the receiver to open it and say it worked. When they never do, the author
  // is the one person who knows the work is finished and has no verb for it, so the board fills
  // with guides sent weeks ago and the free plan fills with them too.
  const db = d1();
  const guide = seed(db);
  const old = new Date(Date.parse(T0) - STALE_SENT_MS - 60_000).toISOString();
  const sent = (id, over = {}) => {
    guide(id, { kind: "transfer", target: "", created: old, ...over });
    db.raw
      .prepare("UPDATE guide SET updated = ?, to_account_id = ? WHERE id = ?")
      .run(old, "other", id);
  };

  sent("untouched");
  sent("pulled");
  sent("acked");
  sent("held");
  sent("judged");
  sent("nobodys"); // addressed to no one at all
  db.raw.prepare("UPDATE guide SET to_account_id = '' WHERE id = 'nobodys'").run();

  db.raw
    .prepare("INSERT INTO pull (guide_id, account_id, via, at) VALUES (?, ?, 'cli', ?)")
    .run("pulled", "other", T0);
  db.raw
    .prepare("INSERT INTO ack (guide_id, account_id, taken, note, at) VALUES (?, ?, 1, '', ?)")
    .run("acked", "other", T0);
  // The claim written straight in: `take` would refuse, because a guide with no team is not
  // visible to anyone but its author, and what is being tested here is the query and not take().
  db.raw
    .prepare(
      `INSERT INTO claim (guide_id, place, account_id, agent_id, state, claimed_at, lease_until, updated)
       VALUES (?, 'o/r', 'other', 'agent-other', 'claimed', ?, ?, ?)`,
    )
    .run("held", T0, T0, T0);
  db.raw
    .prepare("INSERT INTO verdict (guide_id, account_id, ok, note, at) VALUES (?, ?, 1, '', ?)")
    .run("judged", "other", T0);

  const stale = await staleSent(db, T0);
  assert.deepEqual(
    stale.map((g) => g.id).sort(),
    ["untouched"],
    "only the one nobody pulled, acked, took or judged — the rest are conversations in progress",
  );
  assert.equal(stale[0].to, "other", "and it knows who to tell");

  // Recent silence is not stale silence: the cutoff is a fortnight back, and a guide touched
  // since then is inside it.
  const earlier = new Date(Date.parse(old) - 1000).toISOString();
  assert.deepEqual(await staleSent(db, earlier), [], "nothing is older than a cutoff before it");
});

test("the author closes a guide nobody ever handed in", async () => {
  // closeGuide was called closeHandedIn and read as though a hand-in were the precondition. It
  // never was — the gate is only that you wrote it — and that name is why the hub offered it on a
  // hand-in row and nowhere else.
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  assert.equal((await closeGuide(db, "h1", { account: "other", at: T0 })).status, 404, "not yours");
  const done = await closeGuide(db, "h1", { account: "me", at: T0 });
  assert.deepEqual(done.claimants, [], "nobody had it, and that is the case this is for");
  const row = await db.prepare("SELECT status FROM guide WHERE id = ?").bind("h1").first();
  assert.equal(row.status, "consumed", "off the board, and reversible");
});

test("nothing is handed in without evidence, and a claim is not evidence", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  guide("report", { kind: "", target: "" });
  await next(db, A, { at: T0 });
  for (const bad of ["", "   ", "done", "it works", "all good"])
    assert.match(
      evidenceProblem(bad) || "",
      /what you ran and what came back/,
      `"${bad}" is a claim, not evidence`,
    );
  assert.equal(evidenceProblem(PROOF), null);
  assert.equal(evidenceProblem("https://github.com/o/r/pull/12"), null, "a link to the change");

  const missing = await finish(db, "t1", A, { at: T0, report: "report", evidence: "done" });
  assert.equal(missing.status, 400);
  assert.match(missing.error, /what you ran and what came back/);
  assert.equal(await stateIn(db, "t1"), "claimed", "a refused hand-in leaves it held");

  guide("h1", { kind: "transfer", target: "" });
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

/** A task t1 that agent A took and finished with a transfer guide called "report". */
async function inReview() {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  guide("report", { kind: "", target: "" });
  await next(db, A, { at: T0 });
  await finish(db, "t1", A, { at: T0, report: "report", evidence: PROOF });
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
  assert.equal(
    (await finish(db, "t1", A, { at: T0, report: "report", evidence: PROOF })).status,
    409,
  );

  // Rejected, then taken by someone else: the first agent cannot finish over the second.
  await next(db, A, { at: T0 });
  await finish(db, "t1", A, { at: T0, report: "report", evidence: PROOF });
  await reject(db, "t1", { account: "me", at: T0, why: "wrong" });
  await next(db, B, { at: T0 });
  assert.equal(await renew(db, "t1", A, { at: T0, note: null }), null);
  assert.equal(
    (await finish(db, "t1", A, { at: T0, report: "report", evidence: PROOF })).status,
    409,
  );
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
  await finish(db, "schema", A, { at: T0, report: "report", evidence: PROOF });
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
  db.raw
    .prepare("UPDATE account SET handle = 'ada', name = 'Ada Lovelace' WHERE id = 'other'")
    .run();
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

// ---- one claim model for every kind (docs/V2.md §11) -------------------------------------------

const C = { account: "me", agent: "agent-c", repo: "o/other" };

test("a handoff has one taker per repo: a second agent in the same repo is told who has it", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  const first = await take(db, "h1", A, { at: T0 });
  assert.equal(first.claim.agent_id, "agent-a");
  assert.equal(first.resumed, false);
  const second = await take(db, "h1", B, { at: later(1) });
  assert.equal(second.status, 409);
  assert.equal(second.holder.agent_id, "agent-a", "the refusal names the agent that has it");
});

test("the same handoff can be taken once in each repo", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  assert.equal((await take(db, "h1", A, { at: T0 })).claim.repo, "o/r");
  assert.equal((await take(db, "h1", C, { at: T0 })).claim.repo, "o/other");
});

test("a task has one taker whatever repo the agent is in", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  assert.equal((await take(db, "t1", A, { at: T0 })).claim.agent_id, "agent-a");
  const elsewhere = await take(db, "t1", { ...C, any: true }, { at: T0 });
  assert.equal(elsewhere.status, 409);
  assert.equal(await next(db, C, { at: T0, any: true }), null);
});

test("a task taken by id from the wrong repo is refused, and says which repo", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  const wrong = await take(db, "t1", C, { at: T0 });
  assert.equal(wrong.status, 400);
  assert.match(wrong.error, /o\/r/);
});

test("an agent holds one thing at a time, and taking it again resumes it", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  guide("h1", { kind: "transfer", target: "" });
  await take(db, "t1", A, { at: T0 });
  const again = await take(db, "t1", A, { at: later(1) });
  assert.equal(again.resumed, true);
  const other = await take(db, "h1", A, { at: later(2) });
  assert.equal(other.status, 409);
  assert.match(other.error, /t1/, "it is told what it already holds");
});

test("a draft cannot be taken, and neither can a blocked task", async () => {
  const db = d1();
  const guide = seed(db);
  guide("d1", { status: "draft" });
  guide("t1");
  guide("t2", { created: later(1) });
  await blockOn(db, "t2", ["t1"], { account: "me" });
  assert.equal((await take(db, "d1", A, { at: T0 })).status, 409);
  assert.equal((await take(db, "t2", A, { at: T0 })).status, 409);
});

test("working names every guide someone holds, of every kind, with who holds it", async () => {
  const db = d1();
  const guide = seed(db);
  db.raw.prepare("UPDATE account SET handle = 'me-h' WHERE id = 'me'").run();
  guide("t1");
  guide("h1", { kind: "transfer", target: "" });
  guide("b1", { kind: "bug", target: "" });
  await take(db, "t1", A, { at: T0 });
  await take(db, "h1", C, { at: T0 });
  const rows = await working(db, "me", later(LEASE_MS + 1));
  assert.deepEqual(rows.map((r) => [r.guide.id, r.guide.kind, r.state]).sort(), [
    ["h1", "transfer", "stalled"],
    ["t1", "task", "stalled"],
  ]);
  assert.equal(rows[0].by.handle, "me-h");
  assert.equal(rows[0].by.you, true);
});

test("an agent passes what it holds: it is free again, and a task says why for the next agent", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  await take(db, "t1", { ...A, host: "mac", worktree: "/w/shop" }, { at: T0 });
  assert.equal((await pass(db, "t1", A, { at: T0, why: "" })).status, 400, "a reason is required");
  const passed = await pass(db, "t1", A, { at: T0, why: "needs a design decision first" });
  assert.equal(passed.kind, "task");
  assert.equal(await stateIn(db, "t1"), "ready");
  const md = db.raw.prepare("SELECT markdown FROM guide WHERE id = 't1'").get().markdown;
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

test("handing in a handoff moves its claim out of working and into waiting on its author", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  await take(db, "h1", A, { at: T0 });
  const done = await handIn(db, "h1", A, { at: T0, note: "applied, tests pass", evidence: PROOF });
  assert.equal(done.claim.state, "review");
  assert.equal(done.claim.note, "applied, tests pass");
  assert.deepEqual(await working(db, "me", T0), []);
  assert.equal(
    (await handIn(db, "h1", B, { at: T0, note: "", evidence: PROOF })).status,
    409,
    "only the taker hands in",
  );
  // Free again for a new piece of work.
  guide("h2", { kind: "transfer", target: "" });
  assert.equal((await take(db, "h2", A, { at: T0 })).claim.guide_id, "h2");
});

test("an agent hand-in stores a verdict only when its own claim moves to review", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  const verdicts = () =>
    db.raw
      .prepare("SELECT ok, note FROM verdict WHERE guide_id = 'h1'")
      .all()
      .map((row) => ({ ok: row.ok, note: row.note }));
  const answer = (agent, ok, note = "") =>
    handIn(db, "h1", agent, { at: T0, note, evidence: PROOF, verdict: { ok } });

  assert.equal((await answer(A, true)).status, 409, "an untaken guide is not handed in");
  assert.deepEqual(verdicts(), [], "a refused hand-in leaves no verdict");

  await take(db, "h1", A, { at: T0 });
  assert.equal((await answer(B, true)).status, 409, "another agent cannot answer the claim");
  assert.deepEqual(verdicts(), []);

  const done = await answer(A, false, "the check failed");
  assert.equal(done.claim.state, "review");
  assert.deepEqual(verdicts(), [{ ok: 0, note: "the check failed" }]);
  assert.equal((await answer(A, true)).status, 409, "the same claim cannot be handed in twice");
  assert.deepEqual(verdicts(), [{ ok: 0, note: "the check failed" }]);

  guide("h2", { kind: "bug", target: "" });
  await take(db, "h2", A, { at: T0 });
  await pass(db, "h2", A, { at: T0, why: "someone else owns the fix" });
  assert.equal(
    (await handIn(db, "h2", A, { at: T0, note: "", evidence: PROOF, verdict: { ok: true } }))
      .status,
    409,
    "a released claim cannot publish a verdict",
  );
  assert.deepEqual(db.raw.prepare("SELECT * FROM verdict WHERE guide_id = 'h2'").all(), []);
});

test("a fenced hand-in stores its evidence and rejects an older claim generation", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  const first = await take(db, "h1", A, { at: T0 });
  await pass(db, "h1", A, { at: T0, why: "try again", fence: first.claim.fence });
  const second = await take(db, "h1", A, { at: T0 });
  const fields = {
    at: T0,
    note: "applied",
    evidence: PROOF,
    writeup: "needed a local setting",
    verdict: { ok: true },
  };
  assert.equal((await handIn(db, "h1", A, { ...fields, fence: first.claim.fence })).status, 409);
  assert.deepEqual(db.raw.prepare("SELECT * FROM verdict WHERE guide_id = 'h1'").all(), []);

  const done = await handIn(db, "h1", A, { ...fields, fence: second.claim.fence });
  assert.equal(done.claim.state, "review");
  const saved = db.raw
    .prepare("SELECT ok, note, detail, writeup FROM verdict WHERE guide_id = 'h1'")
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
  assert.deepEqual(tools(steps("task", "taken")), ["progress", "hand_in", "pass"]);
  assert.deepEqual(tools(steps("transfer", "taken")), ["progress", "hand_in", "pass"]);
  assert.match(steps("task", "taken").next.find((x) => x.tool === "hand_in").when, /Acceptance/);
  assert.match(
    steps("transfer", "taken").next.find((x) => x.tool === "hand_in").when,
    /Verification/,
  );
  assert.match(steps("bug", "taken").next.find((x) => x.tool === "hand_in").when, /Verification/);
  // What to bring rides on every answer, because a rule read at take is forgotten by hand-in.
  for (const kind of ["task", "transfer", "bug"])
    for (const event of ["taken", "progress"])
      assert.match(
        steps(kind, event).next.find((x) => x.tool === "hand_in").with || "",
        kind === "task" ? /checks: one entry per Acceptance line/ : /evidence/,
        `${kind} after ${event}`,
      );
  assert.deepEqual(tools(steps("task", "handed_in")), ["take"]);
  assert.deepEqual(tools(steps("task", "passed")), ["take"]);
  assert.deepEqual(tools(steps("", "nothing")), []);
  assert.match(steps("", "nothing").say, /nothing/i);
  assert.deepEqual(tools(steps("", "not_held")), []);
  assert.match(steps("", "not_held").say, /stop/i);
});

// ---- people, and the author's close on a handoff ------------------------------------------------

const PERSON = { account: "other", agent: "person-other", repo: "" };

function teamed(db) {
  db.raw.exec(`INSERT INTO team (id, slug, name, created_by, created) VALUES ('tm', 'tm', 'T', 'me', '${T0}');
               INSERT INTO membership (team_id, account_id, joined) VALUES ('tm', 'me', '${T0}'), ('tm', 'other', '${T0}');
               UPDATE guide SET team_id = 'tm';`);
}

test("a person taking handoffs in the browser can hold several, and is not stalled in half an hour", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  guide("h2", { kind: "transfer", target: "" });
  teamed(db);
  const opts = { at: T0, many: true, leaseMs: PERSON_LEASE_MS };
  assert.equal((await take(db, "h1", PERSON, opts)).claim.agent_id, "person-other");
  assert.equal(
    (await take(db, "h2", PERSON, opts)).claim.guide_id,
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
  const guide = seed(db);
  guide("t1");
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
  const guide = seed(db);
  guide("t1");
  const mine = { account: "me", agent: "person-someone-else", repo: "", any: true };
  await take(db, "t1", mine, { at: T0, many: true });
  assert.equal((await take(db, "t1", A, { at: later(1) })).claim.agent_id, "agent-a");
});

test("a holder who is not the author can release their own hold, and only theirs", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  teamed(db);
  const t = await take(db, "t1", { ...PERSON, any: true }, { at: T0, many: true });
  assert.ok(t.claim, JSON.stringify(t));
  assert.equal((await release(db, "t1", { account: "stranger", at: later(1) })).status, 404);
  const r = await release(db, "t1", { account: "other", at: later(2) });
  assert.equal(r.state, "ready", JSON.stringify(r));
  assert.equal((await take(db, "t1", A, { at: later(3) })).claim.agent_id, "agent-a");
});

test("the author sees what was handed in on a handoff, and can close it", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  teamed(db);
  const ada = { account: "other", agent: "agent-ada1", repo: "o/r" };
  await take(db, "h1", ada, { at: T0 });
  await handIn(db, "h1", ada, { at: T0, note: "worked in o/r", evidence: PROOF });
  const [row] = await handedIn(db, "me");
  assert.equal(row.guide.id, "h1");
  assert.equal(row.claim.note, "worked in o/r");
  assert.equal(row.claim.place, "o/r");
  assert.deepEqual(await handedIn(db, "other"), [], "only the author's to close");

  assert.equal((await closeGuide(db, "h1", { account: "other", at: T0 })).status, 404);
  const closed = await closeGuide(db, "h1", { account: "me", at: T0 });
  assert.deepEqual(closed.claimants, ["other"]);
  assert.equal(db.raw.prepare("SELECT status FROM guide WHERE id = 'h1'").get().status, "consumed");
  assert.deepEqual(await handedIn(db, "me"), []);
});

test("a hand-in says whether its taker found it worked", async () => {
  const db = d1();
  const guide = seed(db);
  guide("w1", { kind: "transfer", target: "" });
  guide("w2", { kind: "transfer", target: "" });
  teamed(db);
  const ada = { account: "other", agent: "agent-ada1", repo: "o/r" };
  await take(db, "w1", ada, { at: T0 });
  await handIn(db, "w1", ada, { at: T0, note: "ok", evidence: PROOF, verdict: { ok: true } });
  await take(db, "w2", ada, { at: T0 });
  await handIn(db, "w2", ada, { at: T0, note: "no", evidence: PROOF, verdict: { ok: false } });
  const byId = Object.fromEntries((await handedIn(db, "me")).map((r) => [r.guide.id, r.worked]));
  assert.deepEqual(byId, { w1: true, w2: false });
});

test("the author can send one repo's hand-in back with a reason, and it is open there again", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  teamed(db);
  const ada = { account: "other", agent: "agent-ada1", repo: "o/r" };
  await take(db, "h1", ada, { at: T0 });
  await handIn(db, "h1", ada, { at: T0, note: "done", evidence: PROOF });
  const at = { account: "me", at: T0, place: "o/r" };
  assert.equal((await sendBackHandedIn(db, "h1", { ...at, why: "" })).status, 400);
  const back = await sendBackHandedIn(db, "h1", { ...at, why: "the migration never ran" });
  assert.equal(back.claimant, "other");
  assert.deepEqual(await handedIn(db, "me"), []);
  assert.equal((await take(db, "h1", ada, { at: T0 })).resumed, false, "open to take again");
});

// ---- assignment: a task for one person, or one group, is theirs to take ------------------------

const OTHER = { account: "other", agent: "agent-other", repo: "o/r" };

test("a task assigned to a person goes only to their agents", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  teamed(db);
  db.raw.exec("UPDATE guide SET to_account_id = 'other' WHERE id = 't1'");
  assert.equal(await next(db, A, { at: T0 }), null, "not for me");
  const refused = await take(db, "t1", A, { at: T0 });
  assert.equal(refused.status, 409);
  assert.match(refused.error, /assigned/);
  assert.equal((await next(db, OTHER, { at: T0 })).task.id, "t1");
});

test("a task assigned to a group goes to its members", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  teamed(db);
  db.raw.exec(`INSERT INTO team_group (id, team_id, slug, name, created) VALUES ('g1', 'tm', 'web', 'Web', '${T0}');
               INSERT INTO group_member (group_id, account_id) VALUES ('g1', 'other');
               UPDATE guide SET to_group_id = 'g1' WHERE id = 't1';`);
  assert.equal(await next(db, A, { at: T0 }), null);
  assert.equal((await next(db, OTHER, { at: T0 })).task.id, "t1");
});

test("reassigning takes the work back from whoever the new assignment leaves out", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
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
  const md = db.raw.prepare("SELECT markdown FROM guide WHERE id = 't1'").get().markdown;
  assert.match(md, /reassigned to @ada; it was with mac:\/w\/shop/);
  // To the whole team (null): nobody is left out, nothing is dropped.
  await take(db, "t1", OTHER, { at: T0 });
  assert.deepEqual(await dropOutside(db, "t1", { accounts: null, at: T0, why: "x" }), []);
});

test("a team's handoff a teammate already said worked is not taken again, and says who did it", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "", account: "me" });
  teamed(db);
  db.raw.prepare("UPDATE account SET handle = 'ada' WHERE id = 'other'").run();
  db.raw
    .prepare(
      "INSERT INTO verdict (guide_id, account_id, ok, note, at) VALUES ('h1', 'other', 1, 'streams now', ?)",
    )
    .run(T0);
  const third = { account: "me", agent: "agent-third", repo: "o/elsewhere" };
  const refused = await take(db, "h1", third, { at: T0 });
  assert.equal(refused.status, 409);
  assert.match(refused.error, /@ada already said it worked/);
  // Addressed to someone by name, it is theirs to repeat whatever a teammate said.
  db.raw.exec("UPDATE guide SET to_account_id = 'me' WHERE id = 'h1'");
  assert.equal((await take(db, "h1", third, { at: T0 })).claim.agent_id, "agent-third");
});

test("a hand-in that worked can say what it took, and that is not a new guide", async () => {
  // The last of the four channels an agent had to manufacture a guide for. `ok` is a boolean,
  // `note` is 280 characters, and `evidence` is refused unless it is what you ran — so an agent
  // that followed a guide, landed it, and found that one step needed something the guide never
  // mentions had nowhere to put that sentence. It published it: "The email step needs MAIL_FROM
  // and the R2 bucket name", with an id, a share link and an inbox row asking somebody to take it.
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  const ada = { account: "me", agent: "agent-ada", repo: "o/one" };
  await take(db, "h1", ada, { at: T0 });

  const said =
    "Step 4 needed MAIL_FROM and the bucket name; the guide assumes both are in wrangler.toml.";
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
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  const ada = { account: "me", agent: "agent-ada", repo: "o/one" };
  await take(db, "h1", ada, { at: T0 });
  const done = await handIn(db, "h1", ada, { at: T0, note: "worked", evidence: PROOF });
  assert.ok("claim" in done, "no write-up is not a problem");
  assert.equal(done.claim.writeup, "");

  guide("h2", { kind: "transfer", target: "" });
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
  // publish_guide and file_bugs for as long as those existed — "a screenshot you described instead
  // of attaching is the most useful thing in the report, thrown away" — while an image that is the
  // only possible proof of the agent's OWN claim was never asked for once. So "a Sales Order PDF
  // renders with the store's brand colour" came back as "opened SO-00026, the header bar is
  // #1f6feb", and passed, and nothing in the system had looked at anything.
  const visual = "a Sales Order PDF renders with the store's brand colour";
  const described = checksProblem([
    { check: visual, ran: "Opened SO-00026 in the viewer and the header bar is #1f6feb." },
  ]);
  assert.match(described || "", /Run it or show it/);
  assert.match(described || "", /attach_screenshot/, "and it says how");
  assert.match(described || "", /writeup/, "and where a check that is neither belongs");

  // Shown: attach_screenshot and create_upload both end at the same address, so one pattern answers
  // for both, and it is the URL that counts rather than the words around it.
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

  // A client-internal handle is not a picture anybody else can open — the failure guide.ts already
  // refuses at publish, arriving here by the other door.
  assert.match(
    checksProblem([{ check: visual, ran: "here it is: attachment://file_0000abc" }]) || "",
    /Run it or show it/,
  );
});

test("claims.ts and guide.ts agree on what a screenshot url looks like", async () => {
  // claims.ts takes no sibling `.ts` import on purpose — it is tested against a real SQLite and
  // Node's type stripping cannot follow a value import — so the pattern is written out twice. A
  // comment saying "same as the other one" does not fail; this does.
  const read = async (f) => await readFile(new URL(`../src/${f}`, import.meta.url), "utf8");
  const [claims, guide] = await Promise.all([read("claims.ts"), read("guide.ts")]);
  // Compared as text, not as a regex about a regex: the escaping of the second is unreadable and
  // gets in the way of the one thing being checked. In two pieces, because guide.ts captures the
  // id and this file only asks whether there is one — that difference is the point of each and is
  // allowed to stay; the address and the shape of an id are what must not drift.
  for (const piece of [String.raw`\/v1\/shots\/`, "[a-z0-9]{6,16}"]) {
    assert.ok(claims.includes(piece), `claims.ts is missing ${piece}`);
    assert.ok(guide.includes(piece), `guide.ts is missing ${piece}`);
  }
});

test("a thread keeps what progress overwrote and what a release deleted, in order", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  guide("r1", { kind: "transfer" });
  await take(db, "t1", A, { at: T0 });
  await renew(db, "t1", A, { at: later(1000), note: "reading the claims code" });
  // No note is a heartbeat, not a thing said: it renews the lease and writes nothing.
  await renew(db, "t1", A, { at: later(2000), note: null });
  await renew(db, "t1", A, { at: later(3000), note: "migration written" });
  await release(db, "t1", { account: "me", at: later(4000) });
  await take(db, "t1", B, { at: later(5000) });
  await finish(db, "t1", B, { at: later(6000), report: "r1", evidence: PROOF, note: "done" });
  await reject(db, "t1", { account: "me", at: later(7000), why: "Acceptance 2 not met" });

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
      ["sent_back", "Acceptance 2 not met"],
    ],
  );
  assert.equal(t[0].by.agent, true, "a worktree's act is an agent's");
  assert.equal(t[3].by.agent, false, "the author's own act is not");
  assert.equal(t[3].by.you, true);
  assert.equal((await thread(db, "t1", "other"))[3].by.you, false);
});

test("a person's answer in the browser is one line, not the answer and the hold it caused", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", account: "other" });
  const me = { account: "me", agent: "person-me", repo: "" };
  await take(db, "h1", me, { at: T0, many: true });
  db.raw
    .prepare(
      "INSERT INTO ack (guide_id, account_id, taken, note, at) VALUES ('h1', 'me', 1, '', ?)",
    )
    .run(T0);
  await handIn(db, "h1", me, { at: later(1000), note: "works", evidence: "works", person: true });
  db.raw
    .prepare(
      "INSERT INTO verdict (guide_id, account_id, ok, note, at) VALUES ('h1', 'me', 1, 'works', ?)",
    )
    .run(later(1000));
  assert.deepEqual(
    (await thread(db, "h1", "me")).map((i) => i.kind),
    ["ack", "verdict"],
  );
});

test("a thread dies with its guide", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  await take(db, "t1", A, { at: T0 });
  db.raw.exec("PRAGMA foreign_keys = ON");
  db.raw.prepare("DELETE FROM guide WHERE id = 't1'").run();
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM task_event").get().n, 0);
});

test("an agent that asks keeps what it holds, and the card says it is waiting on you", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
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
  assert.equal(stateOf({ status: "published" }, res.claim, later(2000)), "claimed");
  // Answering it clears the waiting, and nothing had to move the card.
  await reply(db, "t1", { account: "me", at: later(3000), body: "Settings." });
  assert.equal((await list(db, "me", later(3000)))[0].claim.asking, "");
});

test("a question is refused when the agent no longer holds it, or holds a newer generation", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
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
  const guide = seed(db);
  db.raw
    .prepare("INSERT INTO account (id, token_hash, created) VALUES ('stranger', 'h-s', ?)")
    .run(T0);
  guide("t1");
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
  // agent they sent, or a teammate who took somebody's handoff.
  guide("t2", { account: "other" });
  db.raw
    .prepare(
      `INSERT INTO claim (guide_id, place, account_id, agent_id, host, repo, worktree, state,
                          claimed_at, lease_until, updated, fence)
       VALUES ('t2', '', 'me', 'agent-a', '', 'o/r', '', 'claimed', ?, ?, ?, 1)`,
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
  const guide = seed(db);
  guide("t1");
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
  const guide = seed(db);
  guide("t1");
  await take(db, "t1", A, { at: T0 });
  for (let i = 0; i < 260; i++) await renew(db, "t1", A, { at: later(i), note: `step ${i}` });
  const n = () => db.raw.prepare("SELECT COUNT(*) AS n FROM task_event").get().n;
  assert.equal(n(), 200, "a runaway agent cannot fill a thread");
  await ask(db, "t1", A, { at: later(300), question: "still room for a question?" });
  assert.equal(n(), 201);
  assert.ok(!("error" in (await reply(db, "t1", { account: "me", at: later(301), body: "yes" }))));
});

test("asking is its own ending: stop, and take with the id to carry on", () => {
  const s = steps("task", "asked");
  assert.match(s.say, /Stop here/);
  assert.deepEqual(
    s.next.map((n) => n.tool),
    ["take"],
  );
  assert.match(steps("task", "progress", 2).say, /2 messages/);
  assert.equal(steps("task", "progress").say, undefined);
});

test("your own agent asking you is heard, and nothing else you do to yourself is", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  const env = { DB: db };
  const feed = () =>
    db.raw.prepare("SELECT kind, times, read_at, note FROM notification ORDER BY id").all();

  await notify(env, {
    to: "me",
    kind: "asked",
    guide_id: "t1",
    actor_id: "me",
    note: "Settings or header?",
  });
  assert.deepEqual(
    feed().map((r) => r.kind),
    ["asked"],
    "the account that owns the agent is who it is waiting on",
  );
  // The self-drop still holds for everything else: nobody needs telling what they just did.
  await notify(env, { to: "me", kind: "replied", guide_id: "t1", actor_id: "me", note: "x" });
  await notify(env, { to: "me", kind: "failed", guide_id: "t1", actor_id: "me" });
  assert.equal(feed().length, 1);
  assert.equal(
    line({ kind: "asked", title: "T", times: 1, actor_name: "Ada", note: "Settings?" }),
    'Ada\'s agent has a question about "T": Settings?',
  );
});

test("a second question is unread again, and is mailed only the first time", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  const env = { DB: db };
  let mails = 0;
  const ask1 = (note) =>
    notify(env, {
      to: "me",
      kind: "asked",
      guide_id: "t1",
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
  await notify(env, { to: "me", kind: "pulled", guide_id: "t1", actor_id: "other" });
  db.raw.prepare("UPDATE notification SET read_at = ? WHERE kind = 'pulled'").run(T0);
  await notify(env, { to: "me", kind: "pulled", guide_id: "t1", actor_id: "other" });
  assert.equal(
    db.raw.prepare("SELECT read_at FROM notification WHERE kind = 'pulled'").get().read_at,
    T0,
  );
});

test("a note left before anyone takes it is handed to whoever does, and to the next one too", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
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
  db.raw.prepare("UPDATE guide SET status = 'consumed' WHERE id = 't1'").run();
  assert.equal((await reply(db, "t1", { account: "me", at: later(7), body: "more" })).status, 409);
});

test("the session-start hook can see that a person has written", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
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

test("a person's browser hold gives way to their own agent taking it in a repo", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  teamed(db);
  const opts = { at: T0, many: true, leaseMs: PERSON_LEASE_MS };
  const ada = { account: "other", agent: "agent-ada1", repo: "o/r" };
  await take(db, "h1", PERSON, opts);
  await take(db, "h1", ada, { at: later(1000) });
  const holds = () =>
    db.raw
      .prepare("SELECT place, agent_id, state FROM claim WHERE guide_id = 'h1' ORDER BY place")
      .all();
  assert.deepEqual(
    holds().map((r) => [r.place, r.agent_id, r.state]),
    [["o/r", "agent-ada1", "claimed"]],
    "one worker, one hold: the agent's",
  );

  // Said after the agent already has it: nothing new, the agent's hold answers.
  const again = await take(db, "h1", PERSON, opts);
  assert.equal(again.resumed, true);
  assert.equal(again.claim.place, "o/r");
  assert.equal(holds().length, 1);
});

test("a hand-in by the person's own agent clears a browser hold left from before", async () => {
  const db = d1();
  const guide = seed(db);
  guide("h1", { kind: "transfer", target: "" });
  teamed(db);
  const ada = { account: "other", agent: "agent-ada1", repo: "o/r" };
  await take(db, "h1", ada, { at: T0 });
  // The state production was left in: a browser hold standing beside the agent's.
  db.raw
    .prepare(
      `INSERT INTO claim (guide_id, place, account_id, agent_id, host, repo, worktree, state, claimed_at, lease_until, updated, fence)
       VALUES ('h1', '', 'other', 'person-other', '', '', '', 'claimed', ?, ?, ?, 1)`,
    )
    .run(T0, later(PERSON_LEASE_MS), T0);
  await handIn(db, "h1", ada, { at: later(1000), note: "done in o/r", evidence: PROOF });
  const rows = db.raw.prepare("SELECT place, state FROM claim WHERE guide_id = 'h1'").all();
  assert.deepEqual(
    rows.map((r) => [r.place, r.state]),
    [["o/r", "review"]],
  );
});

test("migration 0036 clears browser holds already superseded, and nothing else", () => {
  const sql = new DatabaseSync(":memory:");
  const files = readdirSync(MIGRATIONS).sort();
  const at = files.findIndex((f) => f.startsWith("0036_"));
  for (const f of files.slice(0, at)) sql.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  sql.exec(
    `INSERT INTO account (id, token_hash, created) VALUES ('a', 'h', '${T0}'), ('b', 'h2', '${T0}')`,
  );
  for (const g of ["g1", "g2", "t1"])
    sql
      .prepare(
        `INSERT INTO guide (id, account_id, share_key, title, status, source_context, tags, stack, markdown, created, updated, kind)
         VALUES (?, 'a', 'k', 't', 'published', '', '[]', '[]', '', ?, ?, ?)`,
      )
      .run(g, T0, T0, g === "t1" ? "task" : "transfer");
  const hold = sql.prepare(
    `INSERT INTO claim (guide_id, place, account_id, agent_id, host, repo, worktree, state, claimed_at, lease_until, updated, fence)
     VALUES (?, ?, 'b', ?, '', '', '', ?, '${T0}', '${T0}', '${T0}', 1)`,
  );
  hold.run("g1", "", "person-b", "claimed"); // superseded: b's agent has g1 in a repo
  hold.run("g1", "o/r", "agent-b", "review");
  hold.run("g2", "", "person-b", "claimed"); // stands: nothing else of b's on g2
  hold.run("t1", "", "agent-b", "claimed"); // a task's hold has no place, and is an agent's
  sql.exec(readFileSync(join(MIGRATIONS, files[at]), "utf8"));
  const left = sql.prepare("SELECT guide_id, place FROM claim ORDER BY guide_id, place").all();
  assert.deepEqual(
    left.map((r) => `${r.guide_id}:${r.place}`),
    ["g1:o/r", "g2:", "t1:"],
  );
});

test("the author marks a held task done: approved on the spot, and its agent is free for the next", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  guide("t2", { created: later(1) });
  await take(db, "t1", { ...A, host: "mac", worktree: "shop" }, { at: T0 });
  const r = await markDone(db, "t1", { account: "me", at: later(2), note: "pushed, merged" });
  assert.equal(r.state, "done");
  const row = db.raw.prepare("SELECT status, markdown FROM guide WHERE id = 't1'").get();
  assert.equal(row.status, "consumed");
  assert.match(row.markdown, /marked done by its author while held by mac:shop: pushed, merged/);
  assert.equal(
    (await take(db, "t2", A, { at: later(3) })).claim.agent_id,
    "agent-a",
    "the agent that held it is no longer blocked",
  );
});

test("whoever's agent holds a task can mark it done, and it goes to its author for review", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  teamed(db);
  await take(db, "t1", { account: "other", agent: "agent-o", repo: "o/r", any: true }, { at: T0 });
  const r = await markDone(db, "t1", { account: "other", at: later(1), note: "" });
  assert.equal(r.state, "review");
  assert.equal(
    db.raw.prepare("SELECT status FROM guide WHERE id = 't1'").get().status,
    "published",
  );
  assert.equal(
    db.raw.prepare("SELECT state FROM claim WHERE guide_id = 't1'").get().state,
    "review",
  );
  assert.equal((await approve(db, "t1", { account: "me", at: later(2) })).state, "done");
});

test("marking done is refused for anyone else, and for work nobody holds or already handed in", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  teamed(db);
  assert.equal((await markDone(db, "t1", { account: "me", at: T0, note: "" })).status, 409);
  await take(db, "t1", A, { at: T0 });
  assert.equal((await markDone(db, "t1", { account: "other", at: T0, note: "" })).status, 404);
  assert.equal((await markDone(db, "t1", { account: "me", at: later(1), note: "" })).state, "done");
  assert.equal((await markDone(db, "t1", { account: "me", at: later(2), note: "" })).status, 409);
});

test("an agent that went quiet lets its old task go when it asks for another by name", async () => {
  const db = d1();
  const guide = seed(db);
  guide("t1");
  guide("t2", { created: later(1) });
  await take(db, "t1", { ...A, host: "mac", worktree: "shop" }, { at: T0 });
  const live = await take(db, "t2", A, { at: later(LEASE_MS - 1) });
  assert.equal(live.status, 409, "held live, it is still refused");
  assert.match(live.error, /mark it done in the hub/);
  const moved = await take(db, "t2", A, { at: later(LEASE_MS + 1) });
  assert.equal(moved.claim.guide_id, "t2");
  assert.equal(await stateIn(db, "t1", later(LEASE_MS + 2)), "ready");
  const md = db.raw.prepare("SELECT markdown FROM guide WHERE id = 't1'").get().markdown;
  assert.match(md, /released from mac:shop: its agent went quiet and took another task/);
});

test("a worktree is shown by its folder's name alone, whichever way the path is written", () => {
  assert.equal(leaf("/Users/ada/Desktop/work/shop"), "shop");
  assert.equal(leaf("/home/ada/shop/"), "shop");
  assert.equal(leaf("C:\\laragon\\www\\khaime"), "khaime");
  assert.equal(leaf("shop"), "shop");
  assert.equal(leaf(""), "");
});

test("migration 0042 cuts stored worktrees to the folder's name, and leaves the rest", () => {
  const sql = new DatabaseSync(":memory:");
  for (const f of readdirSync(MIGRATIONS)
    .sort()
    .filter((f) => f < "0042_"))
    sql.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  sql.exec(`INSERT INTO account (id, token_hash, created) VALUES ('a', 'h', '${T0}')`);
  const g = (id) =>
    sql
      .prepare(
        `INSERT INTO guide (id, account_id, share_key, title, status, source_context, tags, stack, markdown, created, updated, kind)
         VALUES (?, 'a', 'k', 't', 'published', '', '[]', '[]', '', ?, ?, 'transfer')`,
      )
      .run(id, T0, T0);
  const claim = sql.prepare(
    `INSERT INTO claim (guide_id, place, account_id, agent_id, host, repo, worktree, state, claimed_at, lease_until, updated, fence)
     VALUES (?, ?, 'a', ?, 'pc', '', ?, 'claimed', '${T0}', '${T0}', '${T0}', 1)`,
  );
  const rows = [
    ["/Users/ada/Desktop/work/shop", "shop"],
    ["C:\\laragon\\www\\khaime", "khaime"],
    ["/home/ada/shop/", "shop"],
    ["shop", "shop"],
    ["", ""],
  ];
  rows.forEach(([w], i) => {
    g(`g${i}`);
    claim.run(`g${i}`, "", `agent-${i}`, w);
  });
  const file = readdirSync(MIGRATIONS).find((f) => f.startsWith("0042_"));
  sql.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  const got = sql
    .prepare("SELECT worktree FROM claim ORDER BY guide_id")
    .all()
    .map((r) => r.worktree);
  assert.deepEqual(
    got,
    rows.map(([, want]) => want),
  );
});

test("a sent guide shows when it will be archived, and an author who keeps everything is left alone", async () => {
  const db = d1();
  const guide = seed(db);
  const old = new Date(Date.parse(T0) - 60_000).toISOString();
  const sent = (id) => {
    guide(id, { kind: "transfer", target: "", created: old });
    db.raw
      .prepare("UPDATE guide SET updated = ?, to_account_id = 'other' WHERE id = ?")
      .run(old, id);
  };
  sent("quiet");
  sent("pulled");
  db.raw
    .prepare(
      "INSERT INTO pull (guide_id, account_id, via, at) VALUES ('pulled', 'other', 'cli', ?)",
    )
    .run(T0);

  const due = await archivesAt(db, ["quiet", "pulled"]);
  assert.deepEqual([...due.keys()], ["quiet"], "a guide somebody opened is not on the clock");
  assert.equal(due.get("quiet"), new Date(Date.parse(old) + STALE_SENT_MS).toISOString());

  db.raw.prepare("UPDATE account SET keep_forever = 1 WHERE id = 'me'").run();
  assert.equal((await archivesAt(db, ["quiet"])).size, 0, "keep_forever takes it off the clock");
  const cutoff = new Date(Date.parse(old) + STALE_SENT_MS + 1000).toISOString();
  assert.deepEqual(await staleSent(db, cutoff), [], "and the sweep leaves it where it is");
  db.raw.prepare("UPDATE account SET keep_forever = 0 WHERE id = 'me'").run();
  assert.equal((await staleSent(db, cutoff)).length, 1, "put back, it is archived as before");
});
