// 0068 renames tables and values under rows that already exist. The rows here are written in the
// schema 0067 left, so the names before the rename are the point, not leftovers.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

const DIR = new URL("../migrations/", import.meta.url).pathname;
const T = "2026-10-30T10:00:00.000Z";

test("0068 carries every row across: tables, columns, statuses, frontmatter and kinds", () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  const files = readdirSync(DIR).sort();
  const at = files.findIndex((f) => f.startsWith("0068_"));
  for (const f of files.slice(0, at)) sql.exec(readFileSync(join(DIR, f), "utf8"));

  sql.exec(`
    INSERT INTO account (id, token_hash, created) VALUES ('me', 'h1', '${T}'), ('bo', 'h2', '${T}');
    INSERT INTO guide (id, account_id, share_key, title, status, markdown, created, updated) VALUES
      ('w1', 'me', 'k', 'a', 'published', '---\nid: w1\nstatus: published\n---\n\nsays status: published\n', '${T}', '${T}'),
      ('w2', 'me', 'k', 'b', 'promoted', '---\nid: w2\nstatus: promoted\n---\n', '${T}', '${T}'),
      ('w3', 'me', 'k', 'c', 'consumed', '---\nid: w3\nstatus: consumed\n---\n', '${T}', '${T}'),
      ('w5', 'me', 'k', 'e', 'consumed', '---\nid: w5\nstatus: consumed\n---\n', '${T}', '${T}'),
      ('w4', 'me', 'k', 'd', 'draft', '---\nid: w4\nstatus: draft\n---\n', '${T}', '${T}'),
      ('w6', 'me', 'k', 'f', 'published', '---\nid: w6\nstatus: published\n---\n', '${T}', '${T}');
    INSERT INTO folder (id, created_by, title, created, updated) VALUES ('p1', 'me', 'P', '${T}', '${T}');
    INSERT INTO folder_guide (folder_id, guide_id, added_by, added) VALUES ('p1', 'w1', 'me', '${T}');
    INSERT INTO verdict (guide_id, account_id, ok, at) VALUES ('w3', 'bo', 1, '${T}');
    INSERT INTO claim (guide_id, account_id, agent_id, state, claimed_at, lease_until, updated, evidence)
      VALUES ('w6', 'bo', 'agent', 'review', '${T}', '${T}', '${T}', 'npm test: 12 passed');
    INSERT INTO ack (guide_id, account_id, taken, at) VALUES ('w1', 'bo', 0, '${T}');
    INSERT INTO notification (account_id, kind, guide_id, actor_id, at) VALUES
      ('me', 'handoff', 'w1', 'bo', '${T}'),
      ('me', 'declined', 'w1', 'bo', '${T}'),
      ('me', 'consumed', 'w3', 'bo', '${T}'),
      ('me', 'promoted', '', 'bo', '${T}'),
      ('me', 'sent_back', 'w3', 'bo', '${T}'),
      ('me', 'reopened', 'w3', 'bo', '${T}'),
      ('me', 'sent_back', 'w1', 'bo', '${T}');
  `);
  sql.exec("UPDATE guide SET outcome = 'approved' WHERE id = 'w5'");
  sql.exec(readFileSync(join(DIR, files[at]), "utf8"));

  const rows = sql.prepare("SELECT id, status, markdown FROM work ORDER BY id").all();
  assert.deepEqual(
    rows.map((r) => [r.id, r.status]),
    [
      ["w1", "ready"],
      ["w2", "ready"],
      ["w3", "done"],
      ["w4", "draft"],
      ["w5", "done"],
      ["w6", "done"],
    ],
  );
  assert.equal(
    sql.prepare("SELECT count(*) AS n FROM work WHERE outcome = 'approved'").get().n,
    0,
    "work closed by the old approval reads as finished",
  );
  assert.equal(sql.prepare("SELECT outcome FROM work WHERE id = 'w5'").get().outcome, "finished");
  assert.match(rows[5].markdown, /\nstatus: done\n/, "a hand-in left in review is finished");
  assert.equal(sql.prepare("SELECT outcome FROM work WHERE id = 'w6'").get().outcome, "finished");
  assert.equal(sql.prepare("SELECT count(*) AS n FROM claim").get().n, 0);
  assert.equal(
    sql.prepare("SELECT detail FROM proof WHERE work_id = 'w6'").get().detail,
    "npm test: 12 passed",
  );
  assert.match(rows[0].markdown, /\nstatus: ready\n/);
  assert.match(rows[0].markdown, /says status: published/, "only the frontmatter line changes");
  assert.match(rows[1].markdown, /\nstatus: ready\n/);
  assert.match(rows[2].markdown, /\nstatus: done\n/);

  assert.deepEqual(
    sql
      .prepare("SELECT project_id, work_id FROM project_work")
      .all()
      .map((r) => ({ ...r })),
    [{ project_id: "p1", work_id: "w1" }],
  );
  assert.equal(sql.prepare("SELECT count(*) AS n FROM proof WHERE work_id = 'w3'").get().n, 1);
  assert.equal(
    sql.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'ack'").get().n,
    0,
  );

  const kinds = sql
    .prepare("SELECT kind, work_id FROM notification ORDER BY kind, work_id")
    .all()
    .map((r) => `${r.kind}:${r.work_id}`);
  assert.deepEqual(kinds, [
    "archived:w3",
    "made_admin:",
    "passed:w1",
    "reopened:w1",
    "reopened:w3",
    "sent_to_you:w1",
  ]);

  // Foreign keys followed the rename: deleting work still cascades.
  sql.exec("DELETE FROM work WHERE id = 'w1'");
  assert.equal(sql.prepare("SELECT count(*) AS n FROM project_work").get().n, 0);
  assert.deepEqual(sql.prepare("PRAGMA foreign_key_check").all(), []);
});
