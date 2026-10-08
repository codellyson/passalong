// What an agent is told once, before its first take after a release.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { NEWS, newsFor, unseen } from "../src/news.ts";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

function d1() {
  const sql = new DatabaseSync(":memory:");
  for (const f of readdirSync(MIGRATIONS).sort())
    sql.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  sql.exec("INSERT INTO account (id, token_hash, created) VALUES ('me', 'h', 'now')");
  const bound = (stmt, args) => ({
    first: async () => stmt.get(...args) ?? null,
    run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
  });
  return {
    prepare: (q) => {
      const stmt = sql.prepare(q);
      return { ...bound(stmt, []), bind: (...args) => bound(stmt, args) };
    },
  };
}

const THREE = [
  { id: "a", text: "A" },
  { id: "b", text: "B" },
  { id: "c", text: "C" },
  { id: "d", text: "D" },
];

test("everything after the last one heard, and no more than three", () => {
  assert.deepEqual(
    unseen("b", THREE).map((n) => n.id),
    ["c", "d"],
  );
  assert.deepEqual(unseen("d", THREE), []);
  assert.deepEqual(
    unseen("", THREE).map((n) => n.id),
    ["b", "c", "d"],
  );
  assert.deepEqual(
    unseen("nope", THREE).map((n) => n.id),
    ["b", "c", "d"],
  );
});

test("an account is told once, and the second take is told nothing", async () => {
  const db = d1();
  const first = await newsFor(db, "me");
  assert.ok(first.includes(NEWS[0].text), first);
  assert.ok(first.startsWith("New in Passalong."), first);
  assert.equal(await newsFor(db, "me"), "");
  assert.equal(await newsFor(db, "nobody"), "");
});
