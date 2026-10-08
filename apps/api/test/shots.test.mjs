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
import {
  conversationOn,
  evidenceOn,
  holdShots,
  PROOF_DAYS,
  PROOF_GONE,
  proofExpiry,
  strike,
  sweepOrphans,
  sweepProof,
} from "../src/shots.ts";

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

test("a picture on a reply is carried by the conversation, so the author's next edit does not let it go", async () => {
  const db = d1();
  seed(db);
  const body = "see ![the bug](https://passalong.dev/v1/shots/fff666)";
  db.raw
    .prepare(
      "INSERT INTO task_event (guide_id, kind, account_id, body, at) VALUES ('g1', 'replied', 'me', ?, ?)",
    )
    .run(body, T0);
  db.raw
    .prepare(
      "INSERT INTO task_event (guide_id, kind, account_id, body, at) VALUES ('g1', 'progress', 'me', 'nothing here', ?)",
    )
    .run(T0);
  assert.deepEqual(await conversationOn(db, "g1"), [body], "only what points at a picture");
  assert.deepEqual(await conversationOn(db, "nothing"), []);

  // The replier claims it; an edit of the guide's own markdown that does not mention it must not
  // release it while the conversation still does — which is what `carried` is for.
  db.raw
    .prepare(
      "INSERT INTO shot (id, account_id, guide_id, type, created) VALUES ('fff666', 'me', '', 'image/png', ?)",
    )
    .run("2026-09-20T10:00:00.000Z");
  await holdShots(db, { account: "me", guide: "g1", mine: ["fff666"], carried: ["fff666"] });
  await holdShots(db, { account: "me", guide: "g1", mine: [], carried: ["fff666"] });
  assert.equal(
    db.raw.prepare("SELECT guide_id FROM shot WHERE id = 'fff666'").get().guide_id,
    "g1",
  );
  // Somebody else's upload is not claimed by naming its id in a reply: the account is in the WHERE.
  db.raw
    .prepare(
      "INSERT INTO shot (id, account_id, guide_id, type, created) VALUES ('ggg777', 'them', '', 'image/png', ?)",
    )
    .run(T0);
  await holdShots(db, { account: "me", guide: "g1", mine: ["ggg777"], carried: ["ggg777"] });
  assert.equal(db.raw.prepare("SELECT guide_id FROM shot WHERE id = 'ggg777'").get().guide_id, "");
});

test("the author's own writes read the conversation as well as the evidence", async () => {
  const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const at = src.indexOf("async function carriedShots");
  assert.match(src.slice(at, at + 500), /conversationOn\(/);
});

test("a file on a reply is carried by the conversation as a picture is", async () => {
  const db = d1();
  seed(db);
  const body = "the input\n[orders.csv](https://passalong.dev/v1/attachments/hhh888)";
  db.raw
    .prepare(
      "INSERT INTO task_event (guide_id, kind, account_id, body, at) VALUES ('g1', 'replied', 'me', ?, ?)",
    )
    .run(body, T0);
  assert.deepEqual(await conversationOn(db, "g1"), [body]);
});

// ---- proof: the screenshots on "it works", removed PROOF_DAYS after the guide is closed ----------

const DAY = 86_400_000;
const CLOSED = "2026-09-10T10:00:00.000Z";
const later = (days) => Date.parse(CLOSED) + days * DAY;

/** g1 closed on CLOSED, its document showing one screenshot, a "works" verdict showing another. */
function closedWithProof(db) {
  const shot = seed(db);
  shot("doc111");
  shot("prf222", "them");
  db.raw
    .prepare("UPDATE guide SET status = 'consumed', markdown = ?, updated = ? WHERE id = 'g1'")
    .run("## Goal\n![the design](https://passalong.dev/v1/shots/doc111)\n", CLOSED);
  db.raw.prepare("UPDATE shot SET guide_id = 'g1'").run();
  db.raw
    .prepare(
      `INSERT INTO verdict (guide_id, account_id, ok, note, detail, at)
       VALUES ('g1', 'them', 1, 'works on staging', ?, ?)`,
    )
    .run("Checkout goes through:\n![paid](https://passalong.dev/v1/shots/prf222)", CLOSED);
}

test("a verdict's proof counts as something the guide carries", async () => {
  const db = d1();
  closedWithProof(db);
  const said = await evidenceOn(db, "g1");
  assert.ok(said.some((t) => t.includes("/v1/shots/prf222")));
});

test(`proof stays for ${PROOF_DAYS} days after closing, then goes`, async () => {
  const db = d1();
  closedWithProof(db);
  const early = await sweepProof({ DB: db }, { at: later(PROOF_DAYS - 1) });
  assert.deepEqual(early, { removed: 0, deferred: 0 });
  assert.equal(owner(db, "prf222"), "g1");

  const deleted = [];
  const bucket = { delete: async (keys) => deleted.push(...keys) };
  const done = await sweepProof({ DB: db, SHOTS: bucket }, { at: later(PROOF_DAYS + 1) });
  assert.deepEqual(done, { removed: 1, deferred: 0 });
  assert.deepEqual(deleted, ["prf222.png"]);
  assert.equal(owner(db, "prf222"), undefined, "the row is gone");
});

test("what the guide's own document shows is never proof, and stays", async () => {
  const db = d1();
  closedWithProof(db);
  await sweepProof({ DB: db }, { at: later(30) });
  assert.equal(owner(db, "doc111"), "g1");
});

test("the verdict says its screenshot was removed rather than showing a broken image", async () => {
  const db = d1();
  closedWithProof(db);
  await sweepProof({ DB: db }, { at: later(PROOF_DAYS + 1) });
  const v = db.raw.prepare("SELECT detail FROM verdict WHERE guide_id = 'g1'").get();
  assert.equal(v.detail, `Checkout goes through:\n${PROOF_GONE}`);
});

test("an open guide's proof is kept however old it is", async () => {
  const db = d1();
  closedWithProof(db);
  db.raw.prepare("UPDATE guide SET status = 'published' WHERE id = 'g1'").run();
  assert.deepEqual(await sweepProof({ DB: db }, { at: later(90) }), { removed: 0, deferred: 0 });
});

test("a bucket that refuses leaves everything for the next run", async () => {
  const db = d1();
  closedWithProof(db);
  const bucket = {
    delete: async () => {
      throw new Error("R2 down");
    },
  };
  const r = await sweepProof({ DB: db, SHOTS: bucket }, { at: later(PROOF_DAYS + 1) });
  assert.deepEqual(r, { removed: 0, deferred: 1 });
  assert.equal(owner(db, "prf222"), "g1");
});

test("strike replaces an image or a bare link to a removed shot, and nothing else", () => {
  const text =
    "see ![a](https://x.dev/v1/shots/aaa111) and https://x.dev/v1/shots/aaa111 but not /v1/shots/bbb222";
  assert.equal(
    strike(text, ["aaa111"]),
    `see ${PROOF_GONE} and ${PROOF_GONE} but not /v1/shots/bbb222`,
  );
});

test("a closed guide says when its proof goes, and an author who keeps everything keeps it", async () => {
  const db = d1();
  closedWithProof(db);
  const due = await proofExpiry(db, ["g1"]);
  assert.equal(due.get("g1"), new Date(later(PROOF_DAYS)).toISOString());

  db.raw.prepare("UPDATE guide SET status = 'published' WHERE id = 'g1'").run();
  assert.equal((await proofExpiry(db, ["g1"])).size, 0, "an open guide's proof is not on a clock");
  db.raw.prepare("UPDATE guide SET status = 'consumed' WHERE id = 'g1'").run();

  db.raw.prepare("UPDATE account SET keep_forever = 1").run();
  assert.equal((await proofExpiry(db, ["g1"])).size, 0, "nor is a keeper's");
  assert.deepEqual(await sweepProof({ DB: db }, { at: later(90) }), { removed: 0, deferred: 0 });
  assert.equal(owner(db, "prf222"), "g1", "and the sweep leaves it");
});
