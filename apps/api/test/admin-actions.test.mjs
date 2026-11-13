// The admin hub's writes (admin-hub/CONTRACT.md v1, POST /users/:id/actions/:action), against a
// real SQLite with every migration.
//
// What must hold: only a fresh signature made with the write secret gets in (never the read
// secret); signing out leaves no credential of any kind working; a suspended account is refused at
// every way in; a gift goes through gift() and keeps its rules; and the hub is told 409 when it
// asks for something that cannot be done, rather than it quietly happening anyway.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { adminAction, adminUser, adminUsers, verifyHubRequest } from "../src/admin-users.ts";
import { gift } from "../src/gifts.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "migrations");
const SRC = (f) => readFileSync(join(HERE, "..", "src", f), "utf8");
const NOW = "2026-11-12T10:00:00.000Z";

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

function seeded() {
  const db = d1();
  db.raw.exec(`
    INSERT INTO account (id, token_hash, created, email, handle, name)
      VALUES ('a1', 'h1', '2026-01-01T00:00:00.000Z', 'ada@example.com', 'ada', 'Ada'),
             ('op', 'h2', '2026-01-01T00:00:00.000Z', 'ife@example.com', 'ife', 'Ife'),
             ('own', 'h3', '2026-01-01T00:00:00.000Z', '', 'owner', 'Owner');
    INSERT INTO session (hash, account_id, created, expires)
      VALUES ('sess', 'a1', '2026-05-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
    INSERT INTO token (id, account_id, name, hash, created) VALUES ('k1', 'a1', 'laptop', 'tok', '2026-01-05T00:00:00.000Z');
    INSERT INTO oauth_client (id, account_id, redirect_uri, created) VALUES ('c1', 'op', 'https://x', '2026-02-01T00:00:00.000Z');
    INSERT INTO oauth_token (access_hash, refresh_hash, client_id, account_id, expires, created)
      VALUES ('oat', 'ort', 'c1', 'a1', '2027-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    INSERT INTO oauth_code (code, client_id, account_id, challenge, redirect_uri, expires, created)
      VALUES ('oc', 'c1', 'a1', 'ch', 'https://x', '2027-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    INSERT INTO device_login (id, code, challenge, created, expires, account_id)
      VALUES ('d1', 'CODE1', 'ch', '2026-02-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', 'a1'),
             ('d2', 'CODE2', 'ch', '2026-02-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', '');
    INSERT INTO reset (hash, account_id, created, expires) VALUES ('rs', 'a1', '2026-02-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
    INSERT INTO upload (hash, account_id, created, expires) VALUES ('up', 'a1', '2026-02-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
    -- Someone else's credentials, which no action on a1 may touch.
    INSERT INTO session (hash, account_id, created, expires)
      VALUES ('sess-op', 'op', '2026-05-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
    INSERT INTO token (id, account_id, name, hash, created) VALUES ('k2', 'op', 'op', 'tok-op', '2026-01-05T00:00:00.000Z');
  `);
  return db;
}

const ctx = (o = {}) => ({ operator: "ife@example.com", at: NOW, owners: "", give: gift, ...o });
const one = (db, q, ...a) => ({ ...(db.raw.prepare(q).get(...a) ?? {}) });

// ---- the signature --------------------------------------------------------------------------

const enc = new TextEncoder();
async function sign(secret, method, path, ts, operator, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${method}\n${path}\n${ts}\n${operator}\n${body}`),
  );
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const PATH = "/v1/admin-hub/users/a1/actions/suspend";
const BODY = '{"reason":"Chargeback","notify":false}';
const T = Date.parse(NOW);

async function req({ secret = "write", ts = T / 1000, body = BODY, drop = "", operator } = {}) {
  const op = operator ?? "ife@example.com";
  const headers = {
    "x-hub-timestamp": String(ts),
    "x-hub-operator": op,
    "x-hub-signature": await sign(secret, "POST", PATH, String(ts), op, body),
  };
  if (drop) delete headers[drop];
  return new Request(`https://passalong.dev${PATH}`, { method: "POST", headers, body });
}

test("a write needs a fresh signature made with the write secret over the exact body", async () => {
  assert.equal(await verifyHubRequest(await req(), BODY, "write", T), "ife@example.com");
  // Unset secret: nobody.
  assert.equal(await verifyHubRequest(await req(), BODY, undefined, T), null);
  assert.equal(await verifyHubRequest(await req(), BODY, "", T), null);
  // Signed with something else, including the read secret.
  assert.equal(await verifyHubRequest(await req({ secret: "read" }), BODY, "write", T), null);
  // Any header missing.
  for (const h of ["x-hub-timestamp", "x-hub-operator", "x-hub-signature"])
    assert.equal(await verifyHubRequest(await req({ drop: h }), BODY, "write", T), null, h);
  // Stale either way, past the minute; just inside it is fine.
  assert.equal(await verifyHubRequest(await req({ ts: T / 1000 - 61 }), BODY, "write", T), null);
  assert.equal(await verifyHubRequest(await req({ ts: T / 1000 + 61 }), BODY, "write", T), null);
  assert.ok(await verifyHubRequest(await req({ ts: T / 1000 - 59 }), BODY, "write", T));
  // A body changed after signing, or an operator swapped in.
  const tampered = '{"reason":"Chargeback","notify":true}';
  assert.equal(await verifyHubRequest(await req(), tampered, "write", T), null);
  const r = await req();
  r.headers.set("x-hub-operator", "mallory@example.com");
  assert.equal(await verifyHubRequest(r, BODY, "write", T), null);
});

test("every hub write reads the body raw, verifies with the write secret, and the gate lets only those past", () => {
  const src = SRC("index.ts");
  const helper = src.slice(src.indexOf("async function hubWrite("));
  const head = helper.slice(0, 600);
  assert.match(head, /const raw = await c\.req\.text\(\)/);
  assert.match(head, /verifyHubRequest\(c\.req\.raw, raw, c\.env\.ADMIN_WRITE_SECRET\)/);
  assert.ok(head.indexOf("verifyHubRequest") < head.indexOf("JSON.parse"));
  assert.doesNotMatch(head, /ADMIN_SECRET\b/);
  // Each signed route starts with it, before it reads anything else.
  const posts = [...src.matchAll(/app\.post\("(\/v1\/admin-hub[^"]*)"[^\n]*\n([^\n]*)/g)];
  assert.deepEqual(
    posts.map(([, path]) => path),
    [
      "/v1/admin-hub/users/:id/actions/:action",
      "/v1/admin-hub/campaigns/test",
      "/v1/admin-hub/campaigns/preview",
      "/v1/admin-hub/campaigns",
    ],
  );
  for (const [, path, first] of posts) assert.match(first, /= await hubWrite\(c\);/, path);
  const gate = new RegExp(src.match(/const HUB_WRITE = \/(.*)\/;/)[1]);
  for (const ok of [
    "/v1/admin-hub/users/a1/actions/suspend",
    "/v1/admin-hub/campaigns",
    "/v1/admin-hub/campaigns/test",
    "/v1/admin-hub/campaigns/preview",
  ])
    assert.ok(gate.test(ok), ok);
  for (const no of [
    "/v1/admin-hub/users/a1",
    "/v1/admin-hub/users/a1/actions",
    "/v1/admin-hub/users/a1/actions/x/y",
    "/v1/admin-hub/campaigns/c1",
    "/v1/admin-hub/campaigns/test/x",
    "/v1/admin-hub/campaigns/preview/x",
    "/v1/admin/gifts",
  ])
    assert.ok(!gate.test(no), no);
  assert.match(src, /method === "POST" && HUB_WRITE\.test\(path\)/);
});

// ---- signout and suspend -----------------------------------------------------------------------

function assertNothingWorks(db, id) {
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM session WHERE account_id = ?", id).n, 0);
  assert.equal(
    one(db, "SELECT COUNT(*) AS n FROM token WHERE account_id = ? AND revoked = ''", id).n,
    0,
  );
  // Revoked, not deleted: Settings still lists what there was.
  assert.equal(one(db, "SELECT revoked FROM token WHERE id = 'k1'").revoked, NOW);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM oauth_token WHERE account_id = ?", id).n, 0);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM oauth_code WHERE account_id = ?", id).n, 0);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM device_login WHERE account_id = ?", id).n, 0);
  assert.equal(one(db, "SELECT used FROM reset WHERE hash = 'rs'").used, NOW);
  assert.equal(one(db, "SELECT used FROM upload WHERE hash = 'up'").used, NOW);
}

function assertOthersUntouched(db) {
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM session WHERE account_id = 'op'").n, 1);
  assert.equal(one(db, "SELECT revoked FROM token WHERE id = 'k2'").revoked, "");
  // A sign-in nobody has approved yet belongs to no one, and stays.
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM device_login WHERE id = 'd2'").n, 1);
}

test("signout revokes every kind of credential the account holds, and only theirs", async () => {
  const db = seeded();
  const r = await adminAction(db, "a1", "signout", {}, ctx());
  assert.equal(r.ok, true);
  assert.equal(r.user.id, "a1");
  assert.equal(r.user.status, "active");
  assertNothingWorks(db, "a1");
  assertOthersUntouched(db);
});

test("suspend records who, why and when, revokes everything, and shows in the reads", async () => {
  const db = seeded();
  assert.deepEqual(await adminAction(db, "a1", "suspend", { reason: "  " }, ctx()), {
    status: 400,
    error: "Say why: a suspension needs a reason.",
  });
  const r = await adminAction(db, "a1", "suspend", { reason: "Chargeback", notify: true }, ctx());
  assert.equal(r.ok, true);
  assert.equal(r.user.status, "suspended");
  assertNothingWorks(db, "a1");
  assertOthersUntouched(db);
  const detail = await adminUser(db, "a1");
  assert.deepEqual(detail.suspension, { reason: "Chargeback", by: "ife@example.com", at: NOW });
  assert.equal((await adminUser(db, "op")).suspension, null);
  const ids = async (s) =>
    (await adminUsers(db, { "filter[status]": s })).users.map((u) => u.id).sort();
  assert.deepEqual(await ids("suspended"), ["a1"]);
  assert.deepEqual(await ids("active"), ["op", "own"]);
  // Twice is refused, not repeated.
  const again = await adminAction(db, "a1", "suspend", { reason: "Again" }, ctx());
  assert.equal(again.status, 409);
  assert.match(again.error, /Already suspended since 2026-11-12/);
});

test("unsuspend clears it and gives back nothing that was revoked; an active account is a 409", async () => {
  const db = seeded();
  assert.deepEqual(await adminAction(db, "a1", "unsuspend", {}, ctx()), {
    status: 409,
    error: "This account is not suspended.",
  });
  await adminAction(db, "a1", "suspend", { reason: "Chargeback" }, ctx());
  const r = await adminAction(db, "a1", "unsuspend", {}, ctx());
  assert.equal(r.user.status, "active");
  assert.equal((await adminUser(db, "a1")).suspension, null);
  assert.deepEqual(
    one(db, "SELECT suspended_at, suspended_by, suspended_reason FROM account WHERE id = 'a1'"),
    { suspended_at: "", suspended_by: "", suspended_reason: "" },
  );
  assertNothingWorks(db, "a1");
});

test("unknown account or action is a 404", async () => {
  const db = seeded();
  assert.equal((await adminAction(db, "nope", "signout", {}, ctx())).status, 404);
  assert.equal((await adminAction(db, "a1", "delete-everything", {}, ctx())).status, 404);
});

// ---- a suspended account at every way in -------------------------------------------------------

/** The SQL a route really runs, lifted from its source, so the test cannot drift from it. */
const sqlIn = (src, marker) => {
  const at = src.indexOf(marker);
  assert.ok(at > 0, marker);
  const open = src.lastIndexOf("`", at);
  return src.slice(open + 1, src.indexOf("`", at));
};

test("a suspended account is refused on every path that turns a credential into an account", async () => {
  const db = seeded();
  await adminAction(db, "a1", "suspend", { reason: "Chargeback" }, ctx());
  // Credentials minted after a suspension (or left by a path nobody thought of) still name a
  // suspended account, and each lookup carries that through to the refusal.
  db.raw.exec(`
    INSERT INTO session (hash, account_id, created, expires) VALUES ('s2', 'a1', '${NOW}', '2027-01-01T00:00:00.000Z');
    INSERT INTO token (id, account_id, name, hash, created) VALUES ('k3', 'a1', 'new', 't2', '${NOW}');
    INSERT INTO oauth_token (access_hash, client_id, account_id, expires, created) VALUES ('o2', 'c1', 'a1', '2027-01-01T00:00:00.000Z', '${NOW}');
    INSERT INTO reset (hash, account_id, created, expires) VALUES ('r2', 'a1', '${NOW}', '2027-01-01T00:00:00.000Z');
  `);
  const index = SRC("index.ts");
  const lookups = [
    [sqlIn(index, "FROM token t JOIN account a"), ["t2"]],
    [sqlIn(index, "FROM session s JOIN account a"), ["s2", NOW]],
    [sqlIn(index, "FROM reset r JOIN account a"), ["r2", NOW]],
    [sqlIn(SRC("oauth-store.ts"), "JOIN account a ON a.id = t.account_id"), ["o2"]],
  ];
  for (const [q, args] of lookups) {
    const row = one(db, q, ...args);
    assert.equal(row.account_id, "a1", q);
    assert.equal(row.suspended_at, NOW, q);
  }
  const forgot = index.match(/"(SELECT id FROM account WHERE email = \? [^"]*)"/)[1];
  assert.equal(db.raw.prepare(forgot).get("ada@example.com"), undefined);
  const login = index.match(/"(SELECT id, password_hash, suspended_at FROM account[^"]*)"/)[1];
  assert.equal(
    one(db, login.replace("AND password_hash <> ''", ""), "ada@example.com").suspended_at,
    NOW,
  );
  // And each of them answers with the refusal rather than carrying on.
  const refusals = index.match(/if \([\w?.]+suspended_at\) return err\(c, 403, SUSPENDED\);/g);
  // The app's own dispatch, an OAuth grant, an API token, a session, sign-in and password reset.
  assert.equal(refusals.length, 6);
});

test("product news skips a suspended account", async () => {
  const src = SRC("announcements.ts");
  const reachable = src.match(/const REACHABLE =\s*"([^"]+)"/)[1];
  const db = seeded();
  db.raw.exec("UPDATE account SET email_verified = '2026-01-02T00:00:00.000Z'");
  const who = () =>
    db.raw
      .prepare(`SELECT a.id FROM account a WHERE ${reachable} ORDER BY a.id`)
      .all()
      .map((r) => r.id);
  assert.deepEqual(who(), ["a1", "op"]);
  await adminAction(db, "a1", "suspend", { reason: "Chargeback" }, ctx());
  assert.deepEqual(who(), ["op"]);
});

// ---- comp: Give plan, through gift() -----------------------------------------------------------

test("Give plan gives Solo through gift(), recorded as the operator's account", async () => {
  const db = seeded();
  const r = await adminAction(
    db,
    "a1",
    "comp",
    { plan: "solo", until: "2027-01-31", reason: "Beta tester" },
    ctx(),
  );
  assert.equal(r.ok, true);
  assert.equal(r.user.fields.plan, "solo");
  assert.deepEqual(one(db, "SELECT plan, plan_until FROM account WHERE id = 'a1'"), {
    plan: "solo",
    plan_until: "2027-01-31T23:59:59.999Z",
  });
  assert.deepEqual(
    one(db, "SELECT subject_kind, subject_id, plan, why, by_account FROM plan_grant"),
    {
      subject_kind: "account",
      subject_id: "a1",
      plan: "solo",
      why: "Beta tester",
      by_account: "op",
    },
  );
});

test("an operator with no account is recorded under the deployment's owner, by email", async () => {
  const db = seeded();
  const input = { plan: "solo", until: "2027-01-31", reason: "Beta tester" };
  const stranger = ctx({ operator: "temp@example.com" });
  assert.deepEqual(await adminAction(db, "a1", "comp", input, stranger), {
    status: 409,
    error:
      "temp@example.com has no Passalong account to record this gift under, and ADMIN_ACCOUNTS names none.",
  });
  const r = await adminAction(db, "a1", "comp", input, { ...stranger, owners: "gone, own" });
  assert.equal(r.ok, true);
  assert.deepEqual(one(db, "SELECT why, by_account FROM plan_grant"), {
    why: "Beta tester (given from the admin hub by temp@example.com)",
    by_account: "own",
  });
});

test("Give plan keeps gift()'s rules: a paying customer is a 409 with gift's reason", async () => {
  const db = seeded();
  db.raw.exec("UPDATE account SET plan = 'solo', subscription_id = 'sub_1' WHERE id = 'a1'");
  const r = await adminAction(
    db,
    "a1",
    "comp",
    { plan: "solo", until: "2027-01-31", reason: "Sorry" },
    ctx(),
  );
  assert.equal(r.status, 409);
  assert.match(r.error, /is paying for a plan/);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM plan_grant").n, 0);
  // gift()'s other refusals come through as they are.
  db.raw.exec("UPDATE account SET subscription_id = '' WHERE id = 'a1'");
  const past = await adminAction(
    db,
    "a1",
    "comp",
    { plan: "solo", until: "2020-01-01", reason: "x" },
    ctx(),
  );
  assert.equal(past.status, 400);
  assert.match(past.error, /in the past/);
});

test("Give plan checks its inputs, and Team goes to the one team they own", async () => {
  const db = seeded();
  const give = (input) => adminAction(db, "a1", "comp", input, ctx());
  assert.equal((await give({ plan: "gold", until: "2027-01-31", reason: "x" })).status, 400);
  assert.equal((await give({ plan: "solo", until: "2027-01-31" })).status, 400);
  assert.equal((await give({ plan: "solo", until: "", reason: "x" })).status, 400);
  const none = await give({ plan: "team", until: "2027-01-31", reason: "x" });
  assert.equal(none.status, 409);
  assert.match(none.error, /Owns no team/);
  db.raw.exec(`
    INSERT INTO team (id, slug, name, created_by, created) VALUES ('t1', 'acme', 'Acme', 'a1', '${NOW}');
    INSERT INTO membership (team_id, account_id, role, joined)
      VALUES ('t1', 'a1', 'owner', '${NOW}'), ('t1', 'op', 'member', '${NOW}');
  `);
  const r = await give({ plan: "team", until: "2027-01-31", reason: "Launch partner" });
  assert.equal(r.ok, true);
  assert.equal(r.user.fields.plan, "team");
  assert.deepEqual(one(db, "SELECT plan, seats FROM team WHERE id = 't1'"), {
    plan: "team",
    seats: 2,
  });
  db.raw.exec(`
    INSERT INTO team (id, slug, name, created_by, created) VALUES ('t2', 'beta', 'Beta', 'a1', '${NOW}');
    INSERT INTO membership (team_id, account_id, role, joined) VALUES ('t2', 'a1', 'owner', '${NOW}');
  `);
  const two = await give({ plan: "team", until: "2027-01-31", reason: "x" });
  assert.equal(two.status, 409);
  assert.match(two.error, /Owns 2 teams \(Acme, Beta\)/);
});
