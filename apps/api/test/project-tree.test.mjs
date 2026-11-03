// Moving a project against a real SQLite with every migration applied.
//
// The hub's move menu offers only legal destinations, but the route is what agents and other
// clients reach, so the rule has to hold there: a project never lands inside itself or its own
// subprojects, never crosses from one space to another, and never under a project its mover cannot see.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  contextFor,
  DOCUMENTS_NAMED,
  findVisible,
  moveProblem,
  README_SHOWN,
  repoOf,
  wouldCycle,
} from "../src/project-tree.ts";

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
  const project = db.raw.prepare(
    "INSERT INTO project (id, created_by, team_id, title, parent_id, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const [id, by, team, parent] of [
    ["root", "me", "", ""],
    ["child", "me", "", "root"],
    ["grandchild", "me", "", "child"],
    ["other", "me", "", ""],
    ["shared", "me", "tm", ""],
    ["theirs", "them", "", ""],
  ])
    project.run(id, by, team, id, parent, T0, T0);
  return db;
}

const at = async (db, id) => findVisible(db, "me", id);

test("a project can move under any project of its own space that is not beneath it", async () => {
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

test("a project never moves into itself or anything beneath it", async () => {
  const db = world();
  for (const target of ["root", "child", "grandchild"]) {
    const problem = await moveProblem(db, "me", await at(db, "root"), target);
    assert.equal(problem?.status, 409, `root under ${target}`);
  }
  assert.equal((await moveProblem(db, "me", await at(db, "child"), "grandchild"))?.status, 409);
  assert.equal(await wouldCycle(db, "child", "root"), false);
  assert.equal(await wouldCycle(db, "child", "grandchild"), true);
});

test("a project never crosses from one space to another", async () => {
  const db = world();
  // Personal into a team project, and a team project into a personal one: both refused.
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

test("a team project is visible to every member and to nobody else", async () => {
  const db = world();
  assert.equal((await findVisible(db, "them", "shared"))?.id, "shared");
  assert.equal(await findVisible(db, "them", "root"), null);
  assert.equal(await findVisible(db, "me", "theirs"), null);
  db.raw.exec("DELETE FROM membership WHERE account_id = 'them'");
  assert.equal(await findVisible(db, "them", "shared"), null);
});

test("a project's repo is a column: absent is none, a token is kept trimmed, anything else is refused", async () => {
  const db = world();
  assert.equal((await at(db, "root")).repo, "");
  db.raw
    .prepare("UPDATE project SET repo = ? WHERE id = 'root'")
    .run(repoOf("  github.com/acme/billing "));
  assert.equal((await at(db, "root")).repo, "github.com/acme/billing");
  assert.equal(repoOf(undefined), "");
  assert.equal(repoOf(""), "");
  assert.equal(repoOf("git hub"), null);
  assert.equal(repoOf("x".repeat(201)), null);
  assert.equal(repoOf(42), null);
});

test("taking work hands over each project it is filed in that the taker can see: its README first", async () => {
  // The reader files work into a project, and a project's documents are where the people who know
  // the product wrote it down. Taking the work used to hand over the work alone.
  const db = world();
  db.raw
    .prepare(
      `INSERT INTO work (id, account_id, share_key, title, status, source_context, tags, stack,
                         markdown, created, updated, target)
       VALUES (?, 'them', 'k', 'the upload button does nothing', 'ready', '', '[]', '[]', '', ?, ?, '')`,
    )
    .run("w1", T0, T0);
  db.raw
    .prepare(
      `INSERT INTO work (id, account_id, share_key, title, status, source_context, tags, stack,
                         markdown, created, updated, target)
       VALUES ('loose', 'me', 'k', 'filed nowhere', 'ready', '', '[]', '[]', '', ?, ?, '')`,
    )
    .run(T0, T0);
  const file = db.raw.prepare(
    "INSERT INTO project_work (project_id, work_id, added_by, added) VALUES (?, ?, ?, ?)",
  );
  file.run("shared", "w1", "them", T0);
  file.run("theirs", "w1", "them", new Date(Date.parse(T0) + 60_000).toISOString());
  const doc = db.raw.prepare(
    `INSERT INTO document (id, project_id, name, body, updated_by, created, updated)
     VALUES (?, ?, ?, ?, 'me', ?, ?)`,
  );
  const long = `# Shared\n\n${"x".repeat(README_SHOWN + 10)}`;
  doc.run("rd", "shared", "README", long, T0, T0);
  doc.run("bl", "shared", "Billing", "how billing works", T0, T0);
  doc.run("an", "shared", "api notes", "the routes", T0, T0);
  for (let n = 0; n < DOCUMENTS_NAMED + 2; n++)
    doc.run(`t${n}`, "theirs", `page ${String(n).padStart(2, "0")}`, "", T0, T0);

  const mine = await contextFor(db, "me", "w1");
  assert.deepEqual(
    mine.map((p) => p.id),
    ["shared"],
    "only what the taker can see: not the author's private project",
  );
  const [shared] = mine;
  assert.equal(shared.readme.id, "rd");
  assert.equal(shared.readme.body.length, README_SHOWN, "the head of it, not all of it");
  assert.ok(shared.readme.body.startsWith("# Shared"));
  assert.equal(shared.readme.cut, true, "and it says there is more");
  assert.deepEqual(
    shared.documents.map((d) => d.name),
    ["api notes", "Billing"],
    "the others by name, the README not among them",
  );
  assert.equal(shared.more, 0);

  const theirs = await contextFor(db, "them", "w1");
  assert.deepEqual(
    theirs.map((p) => p.id),
    ["shared", "theirs"],
    "in the order it was filed",
  );
  assert.equal(theirs[1].readme, null, "no README is said as none");
  assert.equal(theirs[1].documents.length, DOCUMENTS_NAMED);
  assert.equal(theirs[1].more, 2, "and how many more there are");

  assert.deepEqual(await contextFor(db, "me", "loose"), [], "work in no project brings nothing");
});
