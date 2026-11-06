// The runner's hand-in waits for a person (2026-11-06). Its agent works with nobody watching, and
// its hand-in used to go straight to Done: work was closed that nobody had looked at, with its pull
// request unmerged. Now it waits in review, and a person approves it or sends it back with a note.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { approve, isRunnerHold, sendBack, stateOf } from "../src/claims.ts";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(here, "..", "migrations");
const index = readFileSync(join(here, "../src/index.ts"), "utf8");
const T0 = "2026-11-06T10:00:00.000Z";
// What a claim keeps of the runner's worktree: its last part (claims.leaf).
const RUN = "run-1762423200000-1";

/** Every migration, in SQLite, behind D1's shape. Numbered parameters are spelled out. */
function d1() {
  const sql = new DatabaseSync(":memory:");
  for (const f of readdirSync(MIGRATIONS).sort())
    sql.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  const prepare = (q) => {
    const order = [];
    const stmt = sql.prepare(
      q.replace(/\?(\d+)/g, (_m, n) => {
        order.push(Number(n));
        return "?";
      }),
    );
    const spell = (args) => (order.length ? order.map((n) => args[n - 1]) : args);
    const bound = (raw) => {
      const args = spell(raw);
      return {
        first: async () => stmt.get(...args) ?? null,
        all: async () => ({ results: stmt.all(...args) }),
        run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
      };
    };
    return { ...bound([]), bind: (...args) => bound(args) };
  };
  return {
    raw: sql,
    prepare,
    batch: async (list) => Promise.all(list.map((s) => s.run())),
  };
}

/** Ada's work, handed in by her runner and waiting for review. */
function handedIn() {
  const db = d1();
  db.raw.exec(
    `INSERT INTO account (id, token_hash, created) VALUES ('ada', 'h1', '${T0}'), ('bo', 'h2', '${T0}')`,
  );
  db.raw
    .prepare(
      `INSERT INTO work (id, account_id, share_key, title, status, source_context, tags, stack,
                         markdown, created, updated, alone)
       VALUES ('w1', 'ada', 'k', 'Coupon dates', 'ready', '', '[]', '[]', ?, ?, ?, 0)`,
    )
    .run("---\nstatus: ready\n---\n# Coupon dates\n", T0, T0);
  db.raw
    .prepare(
      `INSERT INTO claim (work_id, account_id, agent_id, host, repo, worktree, state, claimed_at,
                          lease_until, updated, fence, note, evidence, checks, pr)
       VALUES ('w1', 'ada', 'agent1', 'Mac', 'o/khaime-mobile', ?, 'review', ?, ?, ?, 1,
               'Coupons end on the store''s last second.', '$ npm test\n12 passing', '', 'https://example.test/pr/1')`,
    )
    .run(RUN, T0, T0, T0);
  return db;
}

test("a hold is the runner's when its worktree is one the runner made", () => {
  assert.equal(isRunnerHold({ worktree: RUN }), true);
  assert.equal(isRunnerHold({ worktree: "/r/khaime-mobile.passalong-runs/run-1-2" }), true);
  assert.equal(isRunnerHold({ worktree: "C:\\code\\app.passalong-runs\\run-1-1" }), true);
  assert.equal(isRunnerHold({ worktree: "khaime-mobile" }), false);
  assert.equal(isRunnerHold({ worktree: "run-the-tests" }), false);
  assert.equal(isRunnerHold({ worktree: "" }), false);
  assert.equal(isRunnerHold(null), false);
});

test("work waiting for review says so, whatever its lease", () => {
  const work = { status: "ready" };
  assert.equal(stateOf(work, { state: "review", lease_until: "2000-01-01" }, T0), "review");
  assert.equal(stateOf(work, { state: "claimed", lease_until: "2099-01-01" }, T0), "claimed");
});

test("approving puts it in Done with what the runner showed", async () => {
  const db = handedIn();
  const r = await approve(db, "w1", { account: "ada", at: T0 });
  assert.deepEqual(r, { done: true, holder: "ada" });
  const w = db.raw.prepare("SELECT status, outcome, markdown FROM work WHERE id = 'w1'").get();
  assert.equal(w.status, "done");
  assert.equal(w.outcome, "finished");
  assert.match(w.markdown, /status: done/);
  const proof = db.raw.prepare("SELECT note, detail FROM proof WHERE work_id = 'w1'").get();
  assert.equal(proof.note, "Coupons end on the store's last second.");
  assert.match(proof.detail, /12 passing/);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM claim").get().n, 0);
  assert.equal((await approve(db, "w1", { account: "ada", at: T0 })).status, 409, "only once");
});

test("someone outside its team can't approve it", async () => {
  const db = handedIn();
  assert.equal((await approve(db, "w1", { account: "bo", at: T0 })).status, 404);
});

test("sending it back needs a reason, and puts it back with the runner with that note", async () => {
  const db = handedIn();
  assert.equal((await sendBack(db, "w1", { account: "ada", at: T0, note: " " })).status, 400);
  const r = await sendBack(db, "w1", {
    account: "ada",
    at: T0,
    note: "After midnight it still shows yesterday's date.",
  });
  assert.deepEqual(r, { holder: "ada" });
  assert.equal(
    db.raw.prepare("SELECT COUNT(*) AS n FROM claim").get().n,
    0,
    "the hand-in is let go",
  );
  const w = db.raw.prepare("SELECT status, alone FROM work WHERE id = 'w1'").get();
  assert.equal(w.status, "ready");
  assert.equal(w.alone, 1, "the runner takes it again");
  const noted = db.raw.prepare("SELECT kind, body FROM task_event WHERE work_id = 'w1'").get();
  assert.deepEqual(
    { ...noted },
    { kind: "noted", body: "After midnight it still shows yesterday's date." },
  );
});

test("the routes: a runner's hand-in waits, people answer it from the hub, and old runners aren't confused", () => {
  const handIn = index.slice(index.indexOf('app.post("/v1/work/:id/hand_in"'));
  assert.match(
    handIn.slice(0, 3000),
    /if \(claims\.isRunnerHold\(done\.claim\)\) \{[\s\S]*?recordForReview\(c, found\.row, note\);\s+return c\.json\(\{ id: found\.row\.id, state: "review"/,
  );
  for (const route of ["approve", "send-back"]) {
    const at = index.indexOf(`app.post("/v1/work/:id/${route}"`);
    assert.ok(at > 0, route);
    assert.match(
      index.slice(at, at + 300),
      /if \(!byPerson\(c\.get\("client"\)\)\)/,
      `${route} is the hub's`,
    );
  }
  assert.match(index, /const reviewIsDone = Boolean\(version\) && older\(version, "1\.4\.0"\);/);
  assert.match(
    index,
    /taskView\(r\.task, r\.claim, reviewIsDone && r\.state === "review" \? "done" : r\.state\)/,
  );
});
