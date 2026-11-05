// Archiving a project: put away rather than deleted (migration 0070). It leaves the lists people
// and agents see, takes the projects inside it along, and comes back the same way (2026-11-05).
// The routes import siblings Node can't strip, so this runs their SQL against a real SQLite.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

const src = readFileSync(new URL("../src/projects.ts", import.meta.url), "utf8");
const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

function db() {
  const sql = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) sql.exec(readFileSync(new URL(f, dir), "utf8"));
  sql
    .prepare("INSERT INTO account (id, token_hash, created) VALUES ('ada', 'h', '2026-11-05')")
    .run();
  const add = sql.prepare(
    "INSERT INTO project (id, created_by, title, parent_id, created, updated) VALUES (?, 'ada', ?, ?, '2026-11-05', '2026-11-05')",
  );
  add.run("app", "App", "");
  add.run("api", "API", "app"); // inside App
  add.run("ios", "iOS", "api"); // inside API
  add.run("site", "Site", ""); // on its own
  return sql;
}

const archiveSql =
  /`(WITH RECURSIVE subtree\(id\) AS \([\s\S]*?UPDATE project SET archived = \? WHERE id IN \(SELECT id FROM subtree\))`/.exec(
    src,
  )?.[1];

test("archiving takes the projects inside it along, and bringing it back brings them back", () => {
  assert.ok(archiveSql, "the routes archive a subtree");
  const sql = db();
  const archived = () =>
    sql
      .prepare("SELECT id FROM project WHERE archived <> '' ORDER BY id")
      .all()
      .map((r) => r.id);
  sql.prepare(archiveSql).run("app", "2026-11-05T10:00:00.000Z");
  assert.deepEqual(archived(), ["api", "app", "ios"]);
  sql.prepare(archiveSql).run("app", "");
  assert.deepEqual(archived(), []);
});

test("archived projects are out of every list unless asked for", () => {
  assert.match(
    src,
    /if \(c\.req\.query\("archived"\) !== "1"\) where = `\(\$\{where\}\) AND f\.archived = ''`;/,
  );
  assert.match(src, /f\.created, f\.updated, f\.archived,/, "and the list says when");
  // New work is never sorted into one.
  assert.match(
    index,
    /FROM project WHERE team_id = \? AND parent_id = '' AND archived = '' ORDER BY title/,
  );
});

test("only whoever may delete a project may archive or unarchive it", () => {
  const fn = src.slice(src.indexOf("async function setArchived("));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /if \(project\.created_by !== c\.get\("account"\)\)/);
  assert.match(body, /role = 'owner'/);
  assert.match(src, /routes\.post\("\/:project\/archive", \(c\) => setArchived\(c, true\)\);/);
  assert.match(src, /routes\.delete\("\/:project\/archive", \(c\) => setArchived\(c, false\)\);/);
});
