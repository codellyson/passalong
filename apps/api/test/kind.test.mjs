// Every stored guide says what kind it is. A guide stored before this had an empty kind for a
// transfer; migration 0023 writes it out, so one question ("what kind?") has one answer in SQL.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const T0 = "2026-09-22T10:00:00.000Z";

test("a guide stored without a kind is a transfer once migrated", () => {
  const sql = new DatabaseSync(":memory:");
  const files = readdirSync(MIGRATIONS).sort();
  const at = files.findIndex((f) => f.startsWith("0023_"));
  assert.ok(at > 0, "migration 0023 exists");
  for (const f of files.slice(0, at)) sql.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  sql.prepare("INSERT INTO account (id, token_hash, created) VALUES ('me', 'h', ?)").run(T0);
  const guide = sql.prepare(
    `INSERT INTO guide (id, account_id, share_key, title, status, source_context, tags, stack,
                        markdown, created, updated, kind)
     VALUES (?, 'me', 'k', 't', 'published', '', '[]', '[]', '', ?, ?, ?)`,
  );
  guide.run("old", T0, T0, "");
  guide.run("bug", T0, T0, "bug");
  guide.run("task", T0, T0, "task");
  for (const f of files.slice(at)) sql.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  const kinds = Object.fromEntries(
    sql
      .prepare("SELECT id, kind FROM guide")
      .all()
      .map((r) => [r.id, r.kind]),
  );
  assert.deepEqual(kinds, { old: "transfer", bug: "bug", task: "task" });
});
