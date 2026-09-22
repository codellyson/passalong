// Giving a plan away, against a real SQLite with every migration applied.
//
// The thing under test is not "can we set a column" — it is everything that must not happen while
// setting it: giving a plan to somebody who is paying for one, a gift with no end, an end in the
// past, a revoke that takes away a subscription the operator did not give.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findSubject, gift, gifts, isAdmin, revokeGift } from "../src/gifts.ts";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOW = "2026-09-23T10:00:00.000Z";
const NEXT_YEAR = "2027-09-23T00:00:00.000Z";

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
  db.raw
    .prepare("INSERT INTO account (id, token_hash, handle, name, created) VALUES (?, ?, ?, ?, ?)")
    .run("boss", "h-boss", "boss", "The Operator", NOW);
  db.raw
    .prepare("INSERT INTO account (id, token_hash, handle, name, created) VALUES (?, ?, ?, ?, ?)")
    .run("ada", "h-ada", "ada", "Ada Lovelace", NOW);
  db.raw
    .prepare(
      "INSERT INTO team (id, slug, name, created_by, created) VALUES ('tm', 'acme', 'Acme', 'boss', ?)",
    )
    .run(NOW);
}

// Spread, because node:sqlite hands back null-prototype rows and a strict deepEqual sees that.
const account = (db, id) => ({
  ...db.raw.prepare("SELECT plan, plan_until, plan_since FROM account WHERE id = ?").get(id),
});

test("only the accounts the deployment names may give a plan away", () => {
  assert.equal(isAdmin("boss,other", "boss"), true);
  assert.equal(isAdmin(" boss , other ", "other"), true, "spaces around a list are not an id");
  assert.equal(isAdmin("boss", "ada"), false);
  // Unset means nobody, so a deployment that was never told who the operator is has no admin at all.
  assert.equal(isAdmin("", "boss"), false);
  assert.equal(isAdmin(undefined, "boss"), false);
  assert.equal(isAdmin("boss", ""), false, "an empty account never matches an empty entry");
});

test("a handle names a person and team/slug names a team", async () => {
  const db = d1();
  seed(db);
  assert.deepEqual(await findSubject(db, "@ada"), {
    kind: "account",
    id: "ada",
    name: "Ada Lovelace",
  });
  assert.deepEqual(await findSubject(db, "ada"), {
    kind: "account",
    id: "ada",
    name: "Ada Lovelace",
  });
  assert.deepEqual(await findSubject(db, "team/acme"), { kind: "team", id: "tm", name: "Acme" });
  assert.equal(await findSubject(db, "@nobody"), null);
  assert.equal(await findSubject(db, "team/nothing"), null);
});

test("a gift sets the plan, the date it ends, and a record of who gave it and why", async () => {
  const db = d1();
  seed(db);
  const r = await gift(db, {
    to: "@ada",
    until: NEXT_YEAR,
    why: "design partner",
    by: "boss",
    at: NOW,
  });
  assert.equal(r.error, undefined);
  assert.equal(r.subject.name, "Ada Lovelace");
  assert.deepEqual(account(db, "ada"), {
    plan: "solo",
    plan_until: NEXT_YEAR,
    plan_since: NOW,
  });
  const [row] = await gifts(db, { at: NOW });
  assert.equal(row.plan, "solo");
  assert.equal(row.why, "design partner");
  assert.equal(row.by, "The Operator");
  assert.equal(row.to, "Ada Lovelace");
  assert.equal(row.live, true);
});

test("a team is given the team plan, with the seats it was given", async () => {
  const db = d1();
  seed(db);
  const r = await gift(db, { to: "team/acme", until: NEXT_YEAR, seats: 5, by: "boss", at: NOW });
  assert.equal(r.error, undefined);
  assert.deepEqual(
    { ...db.raw.prepare("SELECT plan, seats, plan_until FROM team WHERE id = 'tm'").get() },
    {
      plan: "team",
      seats: 5,
      plan_until: NEXT_YEAR,
    },
  );
});

test("a gift ends: no date, or one already past, is refused", async () => {
  const db = d1();
  seed(db);
  const bad = async (until) => (await gift(db, { to: "@ada", until, by: "boss", at: NOW })).error;
  assert.match(await bad(""), /until/i);
  assert.match(await bad("next tuesday"), /date/i);
  assert.match(await bad("2026-01-01T00:00:00.000Z"), /past/i);
  assert.equal(account(db, "ada").plan, "free", "a refused gift changes nothing");
});

test("somebody who is paying is never given what they already bought", async () => {
  const db = d1();
  seed(db);
  db.raw
    .prepare("UPDATE account SET plan = 'solo', subscription_id = 'sub_123' WHERE id = 'ada'")
    .run();
  const r = await gift(db, { to: "@ada", until: NEXT_YEAR, by: "boss", at: NOW });
  assert.match(r.error, /paying/i);
  // Untouched: a gift must never overwrite a subscription, least of all its end date, which is
  // what would then expire a plan somebody is being charged for.
  assert.deepEqual(account(db, "ada"), { plan: "solo", plan_until: "", plan_since: "" });
});

test("revoking ends it now, and says so rather than deleting the record", async () => {
  const db = d1();
  seed(db);
  const { id } = await gift(db, { to: "@ada", until: NEXT_YEAR, by: "boss", at: NOW });
  const later = "2026-09-24T10:00:00.000Z";
  assert.equal((await revokeGift(db, id, { at: later })).error, undefined);
  assert.deepEqual(account(db, "ada"), {
    plan: "lapsed",
    plan_until: "",
    plan_since: later,
  });
  const [row] = await gifts(db, { at: later });
  assert.equal(row.live, false, "the record stays, and says it is over");
  assert.match((await revokeGift(db, id, { at: later })).error, /already/i);
  assert.equal((await revokeGift(db, "nope", { at: later })).error !== undefined, true);
});

test("revoking never touches a plan the operator did not give", async () => {
  const db = d1();
  seed(db);
  const { id } = await gift(db, { to: "@ada", until: NEXT_YEAR, by: "boss", at: NOW });
  // They bought one in the meantime: the subscription is now what their plan is about.
  db.raw
    .prepare("UPDATE account SET subscription_id = 'sub_123', plan_until = '' WHERE id = 'ada'")
    .run();
  const r = await revokeGift(db, id, { at: "2026-09-25T10:00:00.000Z" });
  assert.equal(r.error, undefined);
  assert.equal(account(db, "ada").plan, "solo", "their own subscription is left alone");
});

test("a gift that ran out on its own reads as over, with nothing having to run", async () => {
  const db = d1();
  seed(db);
  await gift(db, { to: "@ada", until: "2026-09-23T12:00:00.000Z", by: "boss", at: NOW });
  assert.equal((await gifts(db, { at: NOW }))[0].live, true);
  assert.equal((await gifts(db, { at: "2026-09-24T00:00:00.000Z" }))[0].live, false);
});

// ---- the routes, read rather than imported (the app is not importable under type stripping) ----

const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const routes = index.slice(
  index.indexOf("// ---- giving a plan away"),
  index.indexOf("// ---- identity"),
);

test("the operator's routes are shut, and say nothing, on a deployment with no operator", () => {
  assert.ok(routes.length > 0, "found the routes");
  // 404 rather than 403: a route nobody is the operator of should not confirm it exists.
  assert.match(routes, /isAdmin\(c\.env\.ADMIN_ACCOUNTS, account\)/);
  assert.equal([...routes.matchAll(/err\(c, 404, "Not found\."\)/g)].length, 3, "all three gated");
  for (const verb of ["app.post", "app.get", "app.delete"])
    assert.ok(routes.includes(`${verb}("/v1/admin/gifts`), `${verb} is gated`);
});

test("a subscription arriving clears the date a gift left behind", () => {
  // Otherwise a webhook would put somebody on a paid plan that expires on a day an operator typed
  // months earlier, and the charge would go on.
  const webhook = index.slice(index.indexOf("const soloId ="), index.indexOf("count(c, \"plan_changed\", { provider, plan: change.plan, subject: \"team\" })"));
  assert.equal([...webhook.matchAll(/plan_until = ''/g)].length, 2, "the account's and the team's");
});
