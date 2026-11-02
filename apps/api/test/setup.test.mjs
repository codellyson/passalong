// First-run setup against a real SQLite with every migration applied, including the one that
// puts it away for accounts that were already in a team.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { applySetup, getSetup, readSetup, saveSetup, setupProblem } from "../src/setup.ts";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const files = readdirSync(MIGRATIONS).sort();
const run = (sql, fs) => {
  for (const f of fs) sql.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
};
const d1 = (sql) => ({
  prepare(q) {
    const stmt = sql.prepare(q);
    const bound = (args) => ({
      first: async () => stmt.get(...args) ?? null,
      run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
    });
    return { ...bound([]), bind: (...args) => bound(args) };
  },
});
const at = files.findIndex((f) => f.startsWith("0066"));
const addAccount = (sql, id) =>
  sql
    .prepare("INSERT INTO account (id, token_hash, created) VALUES (?, ?, ?)")
    .run(id, `retired:${id}`, "2026-10-01T00:00:00Z");

test("0066 puts setup away for accounts already in a team, and only them", async () => {
  const sql = new DatabaseSync(":memory:");
  run(sql, files.slice(0, at));
  addAccount(sql, "lead");
  addAccount(sql, "loner");
  sql
    .prepare(
      "INSERT INTO team (id, slug, name, created_by, created) VALUES ('t', 'acme', 'Acme', 'lead', 'x')",
    )
    .run();
  sql
    .prepare(
      "INSERT INTO membership (team_id, account_id, role, joined) VALUES ('t', 'lead', 'owner', 'x')",
    )
    .run();
  run(sql, files.slice(at));
  const db = d1(sql);
  assert.equal((await getSetup(db, "lead")).dismissed, true);
  assert.deepEqual(await getSetup(db, "loner"), {
    done: [],
    skipped: [],
    dismissed: false,
    deferred: false,
  });
});

test("steps are remembered, and done outranks skipped", async () => {
  const sql = new DatabaseSync(":memory:");
  run(sql, files);
  addAccount(sql, "new");
  const db = d1(sql);
  await saveSetup(db, "new", { step: "team", as: "done" });
  await saveSetup(db, "new", { step: "groups", as: "skipped" });
  await saveSetup(db, "new", { step: "team", as: "skipped" });
  let s = await getSetup(db, "new");
  assert.deepEqual(s, { done: ["team"], skipped: ["groups"], dismissed: false, deferred: false });
  await saveSetup(db, "new", { step: "groups", as: "done" });
  s = await saveSetup(db, "new", { dismissed: true });
  assert.deepEqual(s, { done: ["team", "groups"], skipped: [], dismissed: true, deferred: false });
});

test("a change is refused by name, and a stored value it cannot hold reads as not started", () => {
  assert.match(setupProblem({ step: "billing", as: "done" }), /no setup step called "billing"/);
  assert.match(setupProblem({ step: "team", as: "maybe" }), /done or skipped/);
  assert.match(setupProblem({ dismissed: "yes" }), /true or false/);
  assert.match(setupProblem({ deferred: "later" }), /true or false/);
  assert.equal(setupProblem({ deferred: true }), "");
  assert.equal(setupProblem({ step: "know", as: "skipped" }), "");
  assert.deepEqual(readSetup("{nope"), {
    done: [],
    skipped: [],
    dismissed: false,
    deferred: false,
  });
  assert.deepEqual(readSetup('{"done":["team","ghost"],"skipped":["team"]}'), {
    done: ["team"],
    skipped: [],
    dismissed: false,
    deferred: false,
  });
  assert.deepEqual(applySetup(readSetup(""), { step: "inbox", as: "skipped" }).skipped, ["inbox"]);
});

test("Finish later is remembered on its own, and does not put the register away", async () => {
  const sql = new DatabaseSync(":memory:");
  run(sql, files);
  addAccount(sql, "later");
  const db = d1(sql);
  const s = await saveSetup(db, "later", { deferred: true });
  assert.deepEqual(s, { done: [], skipped: [], dismissed: false, deferred: true });
  // It survives a read, so /hub stops sending them back on every later visit too.
  assert.equal((await getSetup(db, "later")).deferred, true);
  // And a step answered afterwards leaves it alone.
  assert.equal((await saveSetup(db, "later", { step: "team", as: "done" })).deferred, true);
});
