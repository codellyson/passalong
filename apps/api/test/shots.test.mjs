// Who owns a screenshot, against a real SQLite with every migration applied.
//
// A shot is kept because something points at it, and swept when nothing does — so the only thing
// worth pinning is what counts as pointing. Two sources do: a guide's markdown, and the evidence
// of a hand-in on that guide. A shot carried only by evidence used to be claimed by neither, and
// the nightly sweep took it a day later.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { evidenceOn, holdShots, sweepOrphans } from "../src/shots.ts";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const T0 = "2026-09-21T10:00:00.000Z";

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
    async batch(stmts) {
      sql.exec("BEGIN");
      try {
        const out = [];
        for (const st of stmts) out.push(await st.run());
        sql.exec("COMMIT");
        return out;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

function seed(db) {
  const acct = db.raw.prepare("INSERT INTO account (id, token_hash, created) VALUES (?, ?, ?)");
  for (const id of ["me", "them"]) acct.run(id, `hash-${id}`, T0);
  db.raw
    .prepare(
      `INSERT INTO guide (id, account_id, share_key, title, status, source_context, tags, stack,
                          markdown, created, updated, kind, target)
       VALUES ('g1', 'me', 'k', 'A task', 'published', '', '[]', '[]', '', ?, ?, 'task', 'o/r')`,
    )
    .run(T0, T0);
  const shot = db.raw.prepare(
    "INSERT INTO shot (id, account_id, guide_id, type, created) VALUES (?, ?, '', 'image/png', ?)",
  );
  return (id, account = "me", created = T0) => shot.run(id, account, created);
}

const owner = (db, id) =>
  db.raw.prepare("SELECT guide_id FROM shot WHERE id = ?").get(id)?.guide_id;

test("a guide holds the shots it points at, and only ones its author uploaded", async () => {
  const db = d1();
  const shot = seed(db);
  shot("aaa111");
  shot("bbb222", "them");
  await holdShots(db, { account: "me", guide: "g1", mine: ["aaa111", "bbb222"], carried: [] });
  assert.equal(owner(db, "aaa111"), "g1");
  assert.equal(owner(db, "bbb222"), "", "naming someone else's upload does not take it");
});

test("a shot the guide no longer carries is let go, and one it carries elsewhere is kept", async () => {
  const db = d1();
  const shot = seed(db);
  shot("aaa111");
  shot("ccc333");
  await holdShots(db, { account: "me", guide: "g1", mine: ["aaa111", "ccc333"], carried: [] });

  // The document is rewritten without either image. Nothing else points at aaa111, so it is
  // released; ccc333 is in a hand-in's evidence, so the guide still carries it.
  await holdShots(db, { account: "me", guide: "g1", mine: [], carried: ["ccc333"] });
  assert.equal(owner(db, "aaa111"), "");
  assert.equal(owner(db, "ccc333"), "g1", "evidence points at it, so the rewrite does not drop it");
});

test("a teammate's hand-in claims the shot in its evidence, which the sweep then leaves alone", async () => {
  const db = d1();
  const shot = seed(db);
  // Uploaded a day ago by the teammate who did the work, and old enough for the sweep.
  shot("ddd444", "them", "2026-09-20T10:00:00.000Z");
  await holdShots(db, { account: "them", guide: "g1", mine: ["ddd444"], carried: ["ddd444"] });
  assert.equal(owner(db, "ddd444"), "g1");
  assert.deepEqual(await sweepOrphans({ DB: db }, { hours: 0 }), { swept: 0, deferred: 0 });
  assert.equal(owner(db, "ddd444"), "g1", "claimed is not orphaned");
});

test("the evidence a guide's hand-ins carry is read back from its claims", async () => {
  const db = d1();
  seed(db);
  db.raw
    .prepare(
      `INSERT INTO claim (guide_id, place, account_id, agent_id, state, evidence,
                          claimed_at, lease_until, updated)
       VALUES (?, ?, 'me', 'agent-a', 'review', ?, ?, ?, ?)`,
    )
    .run("g1", "", "ran it: https://passalong.dev/v1/shots/eee555", T0, T0, T0);
  assert.deepEqual(await evidenceOn(db, "g1"), ["ran it: https://passalong.dev/v1/shots/eee555"]);
  assert.deepEqual(await evidenceOn(db, "nothing"), []);
});
