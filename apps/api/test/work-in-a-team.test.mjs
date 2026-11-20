// A paying team covers the work in it, and only that. It used to be the seat that was lifted, so a
// member of a paid team had no limit on their own work outside it and nobody on a team ever needed
// Solo (2026-11-05). What counts is work ever made (`account.work_made`, migration 0089), not work
// kept: the free plan is one piece of work to try Passalong (2026-11-20). This runs quota.ts's
// roomOf() and the migration's backfill against a real SQLite with every migration.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { ceilingFor, isFull, roomOf } from "../src/quota.ts";

const AT = "2026-11-05T09:00:00.000Z";
const dir = new URL("../migrations/", import.meta.url);
const COUNTER = "0089_work_made.sql";

/** Every migration before the counter, so a test can seed work and then run the backfill. */
function d1() {
  const sql = new DatabaseSync(":memory:");
  for (const f of readdirSync(dir).sort())
    if (f < COUNTER) sql.exec(readFileSync(new URL(f, dir), "utf8"));
  const db = {
    prepare(q) {
      const stmt = sql.prepare(q);
      const bound = (args) => ({ first: async () => stmt.get(...args) ?? null });
      return { ...bound([]), bind: (...args) => bound(args) };
    },
  };
  const rest = () => {
    for (const f of readdirSync(dir).sort())
      if (f >= COUNTER) sql.exec(readFileSync(new URL(f, dir), "utf8"));
  };
  return { sql, db, rest };
}

function seed(sql, { own = "free", until = "" } = {}) {
  sql
    .prepare(
      "INSERT INTO account (id, token_hash, created, plan, plan_until, sync_limit) VALUES ('ada', 'h', ?, ?, ?, 3)",
    )
    .run(AT, own, until);
  const team = sql.prepare(
    "INSERT INTO team (id, slug, name, created_by, created, plan, plan_until) VALUES (?, ?, ?, 'ada', ?, ?, ?)",
  );
  team.run("paid", "paid", "Paid", AT, "team", ""); // bought, renews
  team.run("given", "given", "Given", AT, "team", "2027-01-01T00:00:00.000Z"); // a gift still running
  team.run("ran-out", "ran-out", "Ran out", AT, "team", "2026-11-01T00:00:00.000Z"); // a gift that ended
  team.run("gratis", "gratis", "Gratis", AT, "free", "");
  const work = sql.prepare(
    "INSERT INTO work (id, account_id, share_key, title, markdown, status, created, updated, team_id) VALUES (?, 'ada', ?, 't', '', ?, ?, ?, ?)",
  );
  let n = 0;
  return (team, status = "ready") => {
    n += 1;
    work.run(`w${n}`, `k${n}`, status, AT, AT, team);
  };
}

const room = async (db, team) => {
  const r = await roomOf(db, "ada", team, AT);
  return { used: r.used, ...ceilingFor(r.covered, r.own, "1", r.old, "1", r.own_plan) };
};

test("the counter starts at the work each account keeps outside a paying team", async () => {
  const { sql, db, rest } = d1();
  const add = seed(sql);
  for (const t of ["paid", "paid", "given"]) add(t);
  add("", "draft");
  add("gratis", "done"); // a team that isn't paying, archived: counts like any other
  rest();
  assert.equal((await room(db, "")).used, 2);
});

test("what is counted is work made, so deleting gives nothing back", async () => {
  const { sql, db, rest } = d1();
  const add = seed(sql);
  rest();
  sql.prepare("UPDATE account SET work_made = 3 WHERE id = 'ada'").run();
  add("");
  sql.prepare("DELETE FROM work WHERE account_id = 'ada'").run();
  const r = await room(db, "");
  assert.equal(r.used, 3);
  assert.ok(isFull(r.used, r), "three made, of three, though none is kept");
});

test("at the limit, work can still go to a paying team, and only to one", async () => {
  const { sql, db, rest } = d1();
  seed(sql);
  rest();
  sql.prepare("UPDATE account SET work_made = 3 WHERE id = 'ada'").run();
  for (const t of ["paid", "given"]) {
    const r = await room(db, t);
    assert.equal(r.plan, "unlimited", t);
    assert.equal(isFull(r.used, r), false, t);
  }
  for (const t of ["", "gratis", "ran-out"]) {
    const r = await room(db, t);
    assert.ok(isFull(r.used, r), t || "their own");
  }
});

test("Solo covers their own work, in a team or not", async () => {
  const { sql, db, rest } = d1();
  seed(sql, { own: "solo" });
  rest();
  sql.prepare("UPDATE account SET work_made = 9 WHERE id = 'ada'").run();
  for (const t of ["", "gratis"]) assert.equal((await room(db, t)).plan, "unlimited");
});

test("the free plan is one piece of work when no account override is set", async () => {
  const { sql, db, rest } = d1();
  seed(sql);
  rest();
  sql.prepare("UPDATE account SET sync_limit = 0 WHERE id = 'ada'").run();
  const fresh = await room(db, "");
  assert.deepEqual({ plan: fresh.plan, limit: fresh.limit }, { plan: "free", limit: 1 });
  assert.equal(isFull(fresh.used, fresh), false, "the one try is there");
  sql.prepare("UPDATE account SET work_made = 1 WHERE id = 'ada'").run();
  const used = await room(db, "");
  assert.ok(isFull(used.used, used), "and once made, it is used");
});
