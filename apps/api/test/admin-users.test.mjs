// The admin hub's read of every account, against a real SQLite with every migration applied.
//
// What must hold: nothing without the shared secret (and nothing at all when it is unset), and the
// shape every app answers the hub in — newest first, empty strings as null, a cursor that ends.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { adminUsers, hubAllowed } from "../src/admin-users.ts";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

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
      });
      return { ...bound([]), bind: (...args) => bound(args) };
    },
  };
}

function seeded() {
  const db = d1();
  const add = db.raw.prepare(
    "INSERT INTO account (id, token_hash, created, email, handle, name) VALUES (?, ?, ?, ?, ?, ?)",
  );
  add.run("a1", "h1", "2026-01-01T00:00:00.000Z", "ada@example.com", "ada", "Ada");
  add.run("a2", "h2", "2026-03-01T00:00:00.000Z", "", "", "");
  add.run("a3", "h3", "2026-02-01T00:00:00.000Z", "bob@example.com", "", "Bob B");
  return db;
}

test("the hub's secret is required, and an unset one lets nobody in", async () => {
  assert.equal(await hubAllowed("Bearer s3cret", "s3cret"), true);
  assert.equal(await hubAllowed("Bearer wrong", "s3cret"), false);
  assert.equal(await hubAllowed("", "s3cret"), false);
  assert.equal(await hubAllowed("s3cret", "s3cret"), false);
  assert.equal(await hubAllowed("Bearer anything", undefined), false);
  assert.equal(await hubAllowed("Bearer ", ""), false);
});

test("accounts come newest first in the hub's shape", async () => {
  const body = await adminUsers(seeded(), {});
  assert.equal(body.app, "passalong");
  assert.equal(body.total, 3);
  assert.deepEqual(
    body.users.map((u) => u.id),
    ["a2", "a3", "a1"],
  );
  assert.deepEqual(body.users[0], {
    id: "a2",
    email: null,
    handle: null,
    created_at: "2026-03-01T00:00:00.000Z",
    extra: { plan: "free" },
  });
  assert.equal(body.users[1].handle, "Bob B");
  assert.equal(body.users[2].handle, "ada");
  assert.equal(body.next_cursor, null);
});

test("search and paging", async () => {
  const db = seeded();
  assert.deepEqual(
    (await adminUsers(db, { q: "BOB" })).users.map((u) => u.id),
    ["a3"],
  );
  const p1 = await adminUsers(db, { limit: "2" });
  assert.equal(p1.next_cursor, "2");
  const p2 = await adminUsers(db, { limit: "2", cursor: p1.next_cursor });
  assert.deepEqual(
    p2.users.map((u) => u.id),
    ["a1"],
  );
  assert.equal(p2.next_cursor, null);
});
