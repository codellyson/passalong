// Deleting an account from the admin hub, against a real SQLite with every migration.
//
// What must hold: what was theirs alone is gone, rows and R2 objects both; what other people now
// hold (team work, their words on someone else's work, documents in a shared project) stays and
// stops naming them; and the three cases that would hurt someone else are refused.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { adminAction, adminActivity, adminUser, adminUsers, MANIFEST } from "../src/admin-users.ts";
import { attachmentKey } from "../src/attachments.ts";
import { deleteAccount } from "../src/delete-account.ts";
import { shotKey } from "../src/shots.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "migrations");
const NOW = "2026-11-12T10:00:00.000Z";
const LATER = "2027-01-01T00:00:00.000Z";

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

// projects.ts imports its siblings, so its layout is checked against the source below instead.
const fileKey = (project, file) => `projects/${project}/${file}`;

function bucket() {
  const deleted = [];
  return { deleted, delete: async (keys) => void deleted.push(...[keys].flat()) };
}

const ctx = (b, o = {}) => ({
  at: NOW,
  owners: "",
  bucket: b,
  keys: { shot: shotKey, attachment: attachmentKey, file: fileKey },
  ...o,
});

const work = (id, by, o = {}) =>
  `INSERT INTO "work" (id, account_id, share_key, title, status, markdown, created, updated, team_id, to_account_id)
   VALUES ('${id}', '${by}', 'k${id}', 'T ${id}', 'ready', '', '${NOW}', '${NOW}', '${o.team ?? ""}', '${o.to ?? ""}');`;

function seeded() {
  const db = d1();
  db.raw.exec(`
    INSERT INTO account (id, token_hash, created, email, handle, name, password_hash, email_verified)
      VALUES ('a1', 'h1', '${NOW}', 'ada@example.com', 'ada', 'Ada', 'pbkdf2$x', '${NOW}'),
             ('op', 'h2', '${NOW}', 'ife@example.com', 'ife', 'Ife', '', '');
    -- Acme is op's, with a1 in it. Lone is a1's and nobody else's.
    INSERT INTO team (id, slug, name, created_by, created) VALUES ('acme', 'acme', 'Acme', 'op', '${NOW}'),
      ('lone', 'lone', 'Lone', 'a1', '${NOW}');
    INSERT INTO membership (team_id, account_id, role, joined)
      VALUES ('acme', 'op', 'owner', '${NOW}'), ('acme', 'a1', 'member', '${NOW}'), ('lone', 'a1', 'owner', '${NOW}');
    ${work("w1", "a1")}
    ${work("wself", "a1", { to: "a1" })}
    ${work("w2", "a1", { team: "acme" })}
    ${work("w3", "op", { team: "acme" })}
    ${work("w4", "op", { team: "acme", to: "a1" })}
    ${work("w5", "a1", { team: "lone" })}
    -- Pictures: a1's on their private work, someone else's reply picture on it, a1's never
    -- attached, a1's on team work (kept), and a file on the private work.
    INSERT INTO shot (id, account_id, work_id, type, created) VALUES
      ('s1', 'a1', 'w1', 'image/png', '${NOW}'), ('s2', 'op', 'w1', 'image/jpeg', '${NOW}'),
      ('s3', 'a1', '', 'image/webp', '${NOW}'), ('s4', 'a1', 'w2', 'image/png', '${NOW}'),
      ('s5', 'a1', 'w5', 'image/gif', '${NOW}');
    INSERT INTO attachment (id, account_id, work_id, type, created) VALUES
      ('f1', 'a1', 'w1', 'application/pdf', '${NOW}'), ('f2', 'a1', 'w3', 'text/plain', '${NOW}');
    INSERT INTO task_event (work_id, kind, account_id, body, at) VALUES
      ('w1', 'noted', 'op', 'on the private one', '${NOW}'),
      ('w3', 'progress', 'a1', 'a1 on op''s work', '${NOW}');
    INSERT INTO proof (work_id, account_id, ok, at) VALUES ('w3', 'a1', 1, '${NOW}');
    INSERT INTO claim (work_id, account_id, agent_id, state, claimed_at, lease_until, updated)
      VALUES ('w3', 'a1', 'agent', 'working', '${NOW}', '${LATER}', '${NOW}');
    -- A personal project, a project in Acme, and one in Lone.
    INSERT INTO "project" (id, created_by, team_id, title, created, updated) VALUES
      ('p1', 'a1', '', 'Mine', '${NOW}', '${NOW}'), ('p2', 'a1', 'acme', 'Shared', '${NOW}', '${NOW}'),
      ('p3', 'a1', 'lone', 'Lone stuff', '${NOW}', '${NOW}');
    INSERT INTO "document" (id, project_id, name, body, updated_by, created, updated) VALUES
      ('d1', 'p1', 'README', 'mine', 'a1', '${NOW}', '${NOW}'), ('d2', 'p2', 'README', 'ours', 'a1', '${NOW}', '${NOW}');
    INSERT INTO project_file (id, project_id, name, type, bytes, uploaded_by, created) VALUES
      ('pf1', 'p1', 'a.png', 'image/png', 1, 'a1', '${NOW}'), ('pf2', 'p2', 'b.png', 'image/png', 1, 'a1', '${NOW}'),
      ('pf3', 'p3', 'c.png', 'image/png', 1, 'a1', '${NOW}');
    INSERT INTO session (hash, account_id, created, expires) VALUES ('sess', 'a1', '${NOW}', '${LATER}');
    INSERT INTO token (id, account_id, name, hash, created) VALUES ('k1', 'a1', 'cli', 'tok', '${NOW}');
    INSERT INTO oauth_client (id, account_id, redirect_uri, created) VALUES ('c1', 'a1', 'https://x', '${NOW}');
    INSERT INTO oauth_token (access_hash, client_id, account_id, expires, created) VALUES ('oat', 'c1', 'a1', '${LATER}', '${NOW}');
    INSERT INTO push_subscription (id, account_id, endpoint, p256dh, auth, created) VALUES ('ps', 'a1', 'https://push', 'p', 'a', '${NOW}');
    INSERT INTO notification (account_id, kind, work_id, at) VALUES ('a1', 'sent_to_you', 'w4', '${NOW}'),
      ('op', 'noted', 'w1', '${NOW}');
    INSERT INTO plan_grant (id, subject_kind, subject_id, plan, until, why, by_account, at)
      VALUES ('g1', 'account', 'a1', 'solo', '${LATER}', 'beta', 'op', '${NOW}');
    UPDATE account SET plan = 'solo', plan_until = '${LATER}' WHERE id = 'a1';
  `);
  return db;
}

const ids = (db, q) =>
  db.raw
    .prepare(q)
    .all()
    .map((r) => Object.values(r)[0]);

test("delete takes what was theirs alone, rows and objects, and keeps what others hold", async () => {
  const db = seeded();
  const b = bucket();
  assert.deepEqual(await deleteAccount(db, "a1", ctx(b)), { email: "ada@example.com" });

  // Their private work (and the work sent to themselves) and the lone team's work are gone; team
  // work stays, and work sent to them is addressed to nobody.
  assert.deepEqual(ids(db, `SELECT id FROM "work" ORDER BY id`), ["w2", "w3", "w4"]);
  assert.equal(
    db.raw.prepare(`SELECT to_account_id FROM "work" WHERE id = 'w4'`).get().to_account_id,
    "",
  );
  // Pictures and files: everything on the gone work and their unattached one, objects included.
  assert.deepEqual(ids(db, "SELECT id FROM shot ORDER BY id"), ["s4"]);
  assert.deepEqual(ids(db, "SELECT id FROM attachment ORDER BY id"), ["f2"]);
  assert.deepEqual(
    b.deleted.sort(),
    [
      "s1.png",
      "s2.jpg",
      "s3.webp",
      "s5.gif",
      "files/f1.pdf",
      "projects/p1/pf1",
      "projects/p3/pf3",
    ].sort(),
  );
  // Projects: the personal one and Lone's go; the shared one and its document stay.
  assert.deepEqual(ids(db, `SELECT id FROM "project" ORDER BY id`), ["p2"]);
  assert.deepEqual(ids(db, `SELECT id FROM "document"`), ["d2"]);
  assert.deepEqual(ids(db, "SELECT id FROM project_file"), ["pf2"]);
  // Teams: Lone is gone; they have left Acme, which keeps its owner.
  assert.deepEqual(ids(db, "SELECT id FROM team"), ["acme"]);
  assert.deepEqual(ids(db, "SELECT account_id FROM membership"), ["op"]);
  // What they said and proved on op's work stays; the claim is released.
  assert.deepEqual(ids(db, "SELECT body FROM task_event"), ["a1 on op's work"]);
  assert.equal(ids(db, "SELECT COUNT(*) FROM proof WHERE account_id = 'a1'")[0], 1);
  assert.equal(ids(db, "SELECT COUNT(*) FROM claim")[0], 0);
  // Every credential and every personal row.
  for (const t of [
    "session",
    "token",
    "oauth_client",
    "oauth_token",
    "push_subscription",
    "notification",
  ])
    assert.equal(ids(db, `SELECT COUNT(*) FROM ${t}`)[0], 0, t);
  // The row stays for what still points at it, with nothing that says who it was. The gift and
  // the plan columns stay: those are the financial record.
  const row = { ...db.raw.prepare("SELECT * FROM account WHERE id = 'a1'").get() };
  assert.equal(row.deleted_at, NOW);
  for (const k of ["email", "handle", "password_hash", "email_verified"])
    assert.equal(row[k], "", k);
  assert.equal(row.name, "Deleted account");
  assert.equal(row.plan, "solo");
  assert.equal(ids(db, "SELECT COUNT(*) FROM plan_grant")[0], 1);
  // And the hub no longer sees an account there.
  assert.equal(await adminUser(db, "a1"), null);
  assert.equal(await adminActivity(db, "a1"), null);
  assert.deepEqual(
    (await adminUsers(db, {})).users.map((u) => u.id),
    ["op"],
  );
  assert.equal((await deleteAccount(db, "a1", ctx(bucket()))).status, 404);
  const again = await adminAction(db, "a1", "signout", {}, { operator: "x", at: NOW });
  assert.equal(again.status, 404);
});

test("owning a team with other people in it is refused, and nothing is touched", async () => {
  const db = seeded();
  const b = bucket();
  assert.deepEqual(await deleteAccount(db, "op", ctx(b)), {
    status: 409,
    error: "Owns Acme with 1 other member. Transfer it or remove them first.",
  });
  db.raw.exec(
    `INSERT INTO account (id, token_hash, created) VALUES ('x2', 'h3', '${NOW}');
     INSERT INTO membership (team_id, account_id, role, joined) VALUES ('acme', 'x2', 'member', '${NOW}');`,
  );
  assert.match((await deleteAccount(db, "op", ctx(b))).error, /Owns Acme with 2 other members/);
  assert.deepEqual(b.deleted, []);
  assert.equal(ids(db, "SELECT email FROM account WHERE id = 'op'")[0], "ife@example.com");
});

test("someone still paying for Solo, an admin, and the platform owner are refused", async () => {
  const db = seeded();
  db.raw.exec("UPDATE account SET subscription_id = 'sub_1' WHERE id = 'a1'");
  assert.match((await deleteAccount(db, "a1", ctx(bucket()))).error, /Pays for Solo/);
  // Cancelled and running out: the provider will lapse it, so the account can go.
  db.raw.exec(`UPDATE account SET plan_ends = '${LATER}' WHERE id = 'a1'`);
  db.raw.exec("UPDATE account SET role = 'super' WHERE id = 'a1'");
  assert.match((await deleteAccount(db, "a1", ctx(bucket()))).error, /Remove the role first/);
  db.raw.exec("UPDATE account SET role = '' WHERE id = 'a1'");
  assert.match(
    (await deleteAccount(db, "a1", ctx(bucket(), { owners: "zz, a1" }))).error,
    /Remove the role first/,
  );
  assert.equal("email" in (await deleteAccount(db, "a1", ctx(bucket()))), true);
});

test("without a bucket only rows go", async () => {
  const db = seeded();
  assert.deepEqual(await deleteAccount(db, "a1", ctx(undefined)), { email: "ada@example.com" });
});

test("the manifest lists delete as danger with its consequences, and the route wires the real keys", () => {
  const del = MANIFEST.actions.find((a) => a.id === "delete");
  assert.equal(del.level, "danger");
  assert.ok(del.consequences.length >= 3);
  const src = (f) => readFileSync(join(HERE, "..", "src", f), "utf8");
  assert.match(
    src("projects.ts"),
    /export const fileKey = \(project: string, file: string\) => `projects\/\$\{project\}\/\$\{file\}`;/,
  );
  const route = src("index.ts");
  const at = route.indexOf('c.req.param("action") === "delete"');
  assert.ok(at > 0);
  const body = route.slice(at, at + 700);
  assert.match(body, /keys: \{ shot: shotKey, attachment: attachmentKey, file: fileKey \}/);
  assert.match(body, /bucket: c\.env\.SHOTS/);
  assert.match(body, /c\.json\(\{ ok: true, user: null \}\)/);
  // After the signature, like every other action.
  assert.ok(route.indexOf("verifyHubRequest(c.req.raw") < at);
});
