// The admin hub's reads (admin-hub/CONTRACT.md v1), against a real SQLite with every migration.
//
// What must hold: nothing without the shared secret (and nothing at all when it is unset), and the
// shape every app answers the hub in — newest first, empty strings as null, a cursor that ends, no
// token secret in anything it sends, and only events that happened.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { adminActivity, adminUser, adminUsers, hubAllowed, MANIFEST } from "../src/admin-users.ts";

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
  db.raw.exec(`
    UPDATE account SET plan = 'solo', email_verified = '2026-01-02T00:00:00.000Z' WHERE id = 'a1';
    UPDATE account SET news_mail_off = '2026-03-02T00:00:00.000Z' WHERE id = 'a2';
    INSERT INTO team (id, slug, name, created_by, created, plan)
      VALUES ('t1', 'acme', 'Acme', 'a3', '2026-02-02T00:00:00.000Z', 'team');
    INSERT INTO membership (team_id, account_id, role, joined)
      VALUES ('t1', 'a3', 'owner', '2026-02-02T00:00:00.000Z'), ('t1', 'a1', 'member', '2026-02-03T00:00:00.000Z');
    INSERT INTO session (hash, account_id, created, expires)
      VALUES ('sess-secret', 'a1', '2026-05-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
    INSERT INTO token (id, account_id, name, hash, created, last_used)
      VALUES ('k1', 'a1', 'laptop CLI', 'tok-hash-secret', '2026-01-05T00:00:00.000Z', '2026-06-01T00:00:00.000Z');
    INSERT INTO token (id, account_id, name, hash, created, revoked)
      VALUES ('k2', 'a1', 'old', 'tok-hash-2', '2026-01-04T00:00:00.000Z', '2026-01-06T00:00:00.000Z');
    INSERT INTO oauth_client (id, account_id, redirect_uri, created) VALUES ('c1', 'a3', 'https://x', '2026-02-01T00:00:00.000Z');
    INSERT INTO oauth_token (access_hash, client_id, account_id, expires, created, last_used)
      VALUES ('oa-secret', 'c1', 'a3', '2027-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z');
    INSERT INTO "work" (id, account_id, share_key, title, status, markdown, created, updated)
      VALUES ('w1', 'a1', 'k', 'Fix the login', 'ready', '', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');
    INSERT INTO task_event (work_id, kind, account_id, at)
      VALUES ('w1', 'taken', 'a1', '2026-04-02T00:00:00.000Z'), ('w1', 'handed_in', 'a1', '2026-04-03T00:00:00.000Z'),
             ('w1', 'noted', 'a3', '2026-04-04T00:00:00.000Z');
  `);
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

test("the manifest names the fields, filters, actions and links", () => {
  assert.equal(MANIFEST.contract, 1);
  assert.equal(MANIFEST.app, "passalong");
  assert.deepEqual(
    MANIFEST.fields.map((f) => f.key),
    ["plan", "guides", "email_verified", "news"],
  );
  assert.deepEqual(MANIFEST.fields[0].values, ["free", "solo", "team", "lapsed"]);
  assert.deepEqual(MANIFEST.filters, ["status", "plan"]);
  assert.deepEqual(
    MANIFEST.actions.map((a) => [a.id, a.level]),
    [
      ["signout", "normal"],
      ["suspend", "caution"],
      ["unsuspend", "normal"],
      ["comp", "normal"],
      ["delete", "danger"],
    ],
  );
  assert.deepEqual(
    MANIFEST.actions[1].inputs.map((i) => [i.key, i.type, !!i.required]),
    [
      ["reason", "text", true],
      ["notify", "bool", false],
    ],
  );
  const comp = MANIFEST.actions[3];
  assert.equal(comp.label, "Give plan");
  assert.deepEqual(comp.inputs[0].values, ["solo", "team"]);
  assert.deepEqual(
    comp.inputs.map((i) => [i.key, i.type, i.required]),
    [
      ["plan", "enum", true],
      ["until", "date", true],
      ["reason", "text", true],
    ],
  );
  assert.equal(MANIFEST.links[0].url, "https://passalong.dev/admin");
});

test("accounts come newest first in the contract's shape", async () => {
  const body = await adminUsers(seeded(), {});
  assert.equal(body.total, 3);
  assert.deepEqual(
    body.users.map((u) => u.id),
    ["a2", "a3", "a1"],
  );
  assert.deepEqual(body.users[0], {
    id: "a2",
    email: null,
    name: null,
    status: "active",
    created_at: "2026-03-01T00:00:00.000Z",
    last_seen_at: null,
    fields: { plan: "free", guides: 0, email_verified: false, news: false },
  });
  // A team seat shows as team; what someone bought beats the seat that also covers them.
  assert.deepEqual(body.users[1].fields, {
    plan: "team",
    guides: 0,
    email_verified: false,
    news: true,
  });
  assert.equal(body.users[1].name, "Bob B");
  assert.equal(body.users[1].last_seen_at, "2026-07-01T00:00:00.000Z");
  assert.equal(body.users[2].name, "Ada");
  assert.equal(body.users[2].fields.plan, "solo");
  assert.equal(body.users[2].fields.guides, 1);
  assert.equal(body.users[2].fields.email_verified, true);
  assert.equal(body.users[2].last_seen_at, "2026-06-01T00:00:00.000Z");
  assert.equal(body.next_cursor, null);
});

test("sort and filters", async () => {
  const db = seeded();
  const ids = async (q) => (await adminUsers(db, q)).users.map((u) => u.id);
  assert.deepEqual(await ids({ sort: "created" }), ["a1", "a3", "a2"]);
  assert.deepEqual(await ids({ "filter[plan]": "team" }), ["a3"]);
  assert.deepEqual(await ids({ "filter[plan]": "free" }), ["a2"]);
  assert.deepEqual(await ids({ "filter[status]": "active" }), ["a2", "a3", "a1"]);
  // Nobody here is suspended; admin-actions.test.mjs suspends someone.
  const none = await adminUsers(db, { "filter[status]": "suspended" });
  assert.deepEqual(none, { users: [], total: 0, next_cursor: null });
  assert.equal((await adminUsers(db, { "filter[plan]": "free", limit: "1" })).total, 1);
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

test("one account: its tokens by name and time, its teams, and never a secret", async () => {
  const db = seeded();
  assert.equal(await adminUser(db, "nope"), null);
  const body = await adminUser(db, "a1");
  assert.equal(body.user.id, "a1");
  assert.equal(body.suspension, null);
  assert.deepEqual(body.sections, [
    {
      title: "API tokens",
      columns: ["Name", "Created", "Last used"],
      rows: [["laptop CLI", "2026-01-05", "2026-06-01"]],
    },
    { title: "Teams", columns: ["Team", "Role"], rows: [["Acme", "member"]] },
  ]);
  const sent = JSON.stringify(body);
  for (const secret of ["tok-hash-secret", "tok-hash-2", "sess-secret", "oa-secret", "h1"])
    assert.ok(!sent.includes(secret), secret);
});

test("activity is what happened, newest first, ending in the account", async () => {
  const db = seeded();
  assert.equal(await adminActivity(db, "nope"), null);
  const body = await adminActivity(db, "a1");
  assert.deepEqual(
    body.events.map((e) => [e.at, e.kind, e.summary]),
    [
      ["2026-04-03T00:00:00.000Z", "Finish", 'Finished "Fix the login"'],
      ["2026-04-02T00:00:00.000Z", "Take", 'Took "Fix the login"'],
      ["2026-04-01T00:00:00.000Z", "Work", 'Created "Fix the login"'],
      ["2026-01-01T00:00:00.000Z", "Account", "Created their account"],
    ],
  );
  assert.equal(body.next_cursor, null);
  // Someone who did nothing has their account and nothing invented.
  assert.deepEqual(
    (await adminActivity(db, "a2")).events.map((e) => e.kind),
    ["Account"],
  );
});

test("activity pages at fifty", async () => {
  const db = seeded();
  const add = db.raw.prepare(
    "INSERT INTO task_event (work_id, kind, account_id, at) VALUES ('w1', 'progress', 'a1', ?)",
  );
  for (let i = 0; i < 60; i++) add.run(new Date(Date.UTC(2026, 5, 1, 0, i)).toISOString());
  const p1 = await adminActivity(db, "a1");
  assert.equal(p1.events.length, 50);
  assert.equal(p1.next_cursor, "50");
  const p2 = await adminActivity(db, "a1", p1.next_cursor);
  assert.equal(p2.events.length, 14);
  assert.equal(p2.next_cursor, null);
  assert.equal(p2.events.at(-1).kind, "Account");
});

test("every admin-hub read checks the secret first, and the gate lets only those reads past", () => {
  const src = readFileSync(join(MIGRATIONS, "..", "src", "index.ts"), "utf8");
  const routes = [...src.matchAll(/app\.(\w+)\("(\/v1\/admin-hub[^"]*)"[^\n]*\n?([^\n]*)/g)];
  const reads = routes.filter(([, method]) => method === "get");
  // Seven reads; the four writes are held to their signature by admin-actions.test.mjs.
  assert.equal(reads.length, 7);
  assert.equal(routes.length - reads.length, 4);
  for (const [, , , next] of reads) assert.match(next, /hubRead\(c\)/);
  // The audience is declared before :id, or Hono would read it as a campaign called "audience".
  assert.ok(
    src.indexOf('"/v1/admin-hub/campaigns/audience"') <
      src.indexOf('"/v1/admin-hub/campaigns/:id"'),
  );
  const gate = new RegExp(src.match(/const HUB_READ = \/(.*)\/;/)[1]);
  for (const ok of [
    "/v1/admin-hub",
    "/v1/admin-hub/users",
    "/v1/admin-hub/users/a1",
    "/v1/admin-hub/users/a1/activity",
    "/v1/admin-hub/campaigns",
    "/v1/admin-hub/campaigns/audience",
    "/v1/admin-hub/campaigns/c1",
  ])
    assert.ok(gate.test(ok), ok);
  for (const no of [
    "/v1/admin-hub/x",
    "/v1/admin-hub/users/a1/actions/suspend",
    "/v1/admin-hub/users/a/b/activity",
    "/v1/admin-hub/campaigns/c1/x",
  ])
    assert.ok(!gate.test(no), no);
  assert.match(src, /method === "GET" && HUB_READ\.test\(path\)/);
});
