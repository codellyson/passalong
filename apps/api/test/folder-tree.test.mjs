// Moving a folder against a real SQLite with every migration applied.
//
// The hub's move menu offers only legal destinations, but the route is what agents and other
// clients reach, so the rule has to hold there: a folder never lands inside itself or its own
// subfolders, never crosses from one space to another, and never under a folder its mover cannot see.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findVisible, moveProblem, wouldCycle } from "../src/folder-tree.ts";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const T0 = "2026-10-10T00:00:00.000Z";

/** An empty database with the schema production has, shaped like a D1 binding. */
function d1() {
  const sql = new DatabaseSync(":memory:");
  for (const f of readdirSync(MIGRATIONS).sort())
    sql.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  return {
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
  };
}

/**
 * me: personal  root ─ child ─ grandchild, plus a second root `other`
 * me + them: team tm  shared
 * them: personal  theirs
 */
function world() {
  const db = d1();
  const acct = db.raw.prepare("INSERT INTO account (id, token_hash, created) VALUES (?, ?, ?)");
  for (const a of ["me", "them"]) acct.run(a, `retired:${a}`, T0);
  db.raw.exec(`INSERT INTO team (id, slug, name, created_by, created) VALUES ('tm', 'tm', 'T', 'me', '${T0}');
               INSERT INTO membership (team_id, account_id, joined) VALUES ('tm', 'me', '${T0}'), ('tm', 'them', '${T0}');`);
  const folder = db.raw.prepare(
    "INSERT INTO folder (id, created_by, team_id, title, parent_id, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const [id, by, team, parent] of [
    ["root", "me", "", ""],
    ["child", "me", "", "root"],
    ["grandchild", "me", "", "child"],
    ["other", "me", "", ""],
    ["shared", "me", "tm", ""],
    ["theirs", "them", "", ""],
  ])
    folder.run(id, by, team, id, parent, T0, T0);
  return db;
}

const at = async (db, id) => findVisible(db, "me", id);

test("a folder can move under any folder of its own space that is not beneath it", async () => {
  const db = world();
  assert.equal(await moveProblem(db, "me", await at(db, "grandchild"), "other"), null);
  assert.equal(await moveProblem(db, "me", await at(db, "child"), "other"), null);
  // Up the tree is fine too: a grandchild straight under the root.
  assert.equal(await moveProblem(db, "me", await at(db, "grandchild"), "root"), null);
});

test("the top level is always a destination", async () => {
  const db = world();
  assert.equal(await moveProblem(db, "me", await at(db, "grandchild"), ""), null);
  assert.equal(await moveProblem(db, "me", await at(db, "shared"), ""), null);
});

test("a folder never moves into itself or anything beneath it", async () => {
  const db = world();
  for (const target of ["root", "child", "grandchild"]) {
    const problem = await moveProblem(db, "me", await at(db, "root"), target);
    assert.equal(problem?.status, 409, `root under ${target}`);
  }
  assert.equal((await moveProblem(db, "me", await at(db, "child"), "grandchild"))?.status, 409);
  assert.equal(await wouldCycle(db, "child", "root"), false);
  assert.equal(await wouldCycle(db, "child", "grandchild"), true);
});

test("a folder never crosses from one space to another", async () => {
  const db = world();
  // Personal into a team folder, and a team folder into a personal one: both refused.
  assert.equal((await moveProblem(db, "me", await at(db, "root"), "shared"))?.status, 404);
  assert.equal((await moveProblem(db, "me", await at(db, "shared"), "root"))?.status, 404);
});

test("a parent the mover cannot see is refused the same way as one that does not exist", async () => {
  const db = world();
  const hidden = await moveProblem(db, "me", await at(db, "root"), "theirs");
  const missing = await moveProblem(db, "me", await at(db, "root"), "nowhere");
  assert.equal(hidden?.status, 404);
  assert.deepEqual(hidden, missing);
});

test("a team folder is visible to every member and to nobody else", async () => {
  const db = world();
  assert.equal((await findVisible(db, "them", "shared"))?.id, "shared");
  assert.equal(await findVisible(db, "them", "root"), null);
  assert.equal(await findVisible(db, "me", "theirs"), null);
  db.raw.exec("DELETE FROM membership WHERE account_id = 'them'");
  assert.equal(await findVisible(db, "them", "shared"), null);
});
