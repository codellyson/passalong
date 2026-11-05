// A paying team covers the work in it, and only that. It used to be the seat that was lifted, so a
// member of a paid team had no limit on their own work outside it and nobody on a team ever needed
// Solo (2026-11-05). This runs quota.ts's roomOf() against a real SQLite with every migration.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { ceilingFor, isFull, roomOf } from "../src/quota.ts";

const AT = "2026-11-05T09:00:00.000Z";

function d1() {
  const sql = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) sql.exec(readFileSync(new URL(f, dir), "utf8"));
  const db = {
    prepare(q) {
      const stmt = sql.prepare(q);
      const bound = (args) => ({ first: async () => stmt.get(...args) ?? null });
      return { ...bound([]), bind: (...args) => bound(args) };
    },
  };
  return { sql, db };
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
  for (const t of ["paid", "given", "ran-out", "gratis"])
    sql
      .prepare(
        "INSERT INTO membership (team_id, account_id, role, joined) VALUES (?, 'ada', 'owner', ?)",
      )
      .run(t, AT);
  const work = sql.prepare(
    "INSERT INTO work (id, account_id, share_key, title, markdown, status, created, updated, team_id) VALUES (?, 'ada', ?, 't', '', ?, ?, ?, ?)",
  );
  let n = 0;
  const add = (team, status = "ready") => {
    n += 1;
    work.run(`w${n}`, `k${n}`, status, AT, AT, team);
  };
  return add;
}

const room = async (db, team) => {
  const r = await roomOf(db, "ada", team, AT);
  return { used: r.used, ...ceilingFor(r.covered, r.own, "25", r.old, "1", r.own_plan) };
};

test("work in a paying team is not counted; work anywhere else is", async () => {
  const { sql, db } = d1();
  const add = seed(sql);
  for (const t of ["paid", "paid", "given", "given"]) add(t);
  add(""); // their own
  add("gratis"); // a team that isn't paying
  add("ran-out"); // a team whose gift has ended
  add("", "draft"); // not Ready: never counted
  const r = await room(db, "");
  assert.equal(r.used, 3);
  assert.deepEqual({ plan: r.plan, limit: r.limit }, { plan: "free", limit: 3 });
  assert.ok(isFull(r.used, r), "their own work is at the limit, though they sit on two paid teams");
});

test("at the limit, work can still go to a paying team, and only to one", async () => {
  const { sql, db } = d1();
  const add = seed(sql);
  for (const t of ["", "", ""]) add(t);
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
  const { sql, db } = d1();
  const add = seed(sql, { own: "solo" });
  for (const t of ["", "", "", "gratis"]) add(t);
  for (const t of ["", "gratis"]) assert.equal((await room(db, t)).plan, "unlimited");
});
