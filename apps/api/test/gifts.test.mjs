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
import {
  findPeople,
  findSubject,
  gift,
  gifts,
  isAdmin,
  isPlatformOwner,
  makeSuper,
  revokeGift,
  superAccounts,
  unSuper,
} from "../src/gifts.ts";

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

test("the deployment's list is read as ids, and unset means nobody", async () => {
  const db = d1();
  seed(db);
  assert.equal(await isAdmin(db, "boss,other", "boss"), true);
  assert.equal(await isAdmin(db, " boss , other ", "other"), true, "spaces are not part of an id");
  assert.equal(await isAdmin(db, "boss", "ada"), false);
  // Unset means nobody, so a deployment never told who runs it has no operator at all.
  assert.equal(await isAdmin(db, "", "boss"), false);
  assert.equal(await isAdmin(db, undefined, "boss"), false);
  assert.equal(await isAdmin(db, "boss", ""), false, "an empty account matches no empty entry");
});

test("the picker finds a person by name, handle, email or id, and a team by either", async () => {
  // Because nobody remembers handles: an operator comping a customer knows a name, or half an
  // email, and was left guessing at the rest of an exact `@handle`.
  const db = d1();
  seed(db);
  const names = async (q) => (await findPeople(db, q)).people.map((p) => p.handle || p.id);
  assert.deepEqual(await names("lovel"), ["ada"], "part of a name");
  assert.deepEqual(await names("@ada"), ["ada"], "the @ is not part of what is stored");
  assert.deepEqual(await names("ADA"), ["ada"], "case is not a thing anybody types carefully");
  assert.deepEqual(await names("ada"), ["ada"]);
  assert.deepEqual(await names("boss"), ["boss"], "an id, on the nose");
  assert.deepEqual(
    (await findPeople(db, "acme")).teams.map((t) => ({ ...t })),
    [{ slug: "acme", name: "Acme" }],
  );

  // Two characters before it answers: one letter matches most of a directory, which is a list
  // nobody reads and a query nobody meant.
  assert.deepEqual(await names("a"), []);
  assert.deepEqual((await findPeople(db, "")).teams, []);
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
  assert.equal(r.seats, 5);
  assert.deepEqual(
    { ...db.raw.prepare("SELECT plan, seats, plan_until FROM team WHERE id = 'tm'").get() },
    { plan: "team", seats: 5, plan_until: NEXT_YEAR },
  );
});

test("seats left off cover the team as it is today, never as many as it likes", async () => {
  // Zero is the stored value for a team that never bought seats, and seatsFull() reads it as no
  // limit — right for a free team, wrong for a gift, where nobody chose it. A team comped without
  // a number would otherwise have grown without one.
  const db = d1();
  seed(db);
  const joins = db.raw.prepare(
    "INSERT INTO membership (team_id, account_id, joined) VALUES ('tm', ?, ?)",
  );
  joins.run("boss", NOW);
  joins.run("ada", NOW);
  const r = await gift(db, { to: "team/acme", until: NEXT_YEAR, by: "boss", at: NOW });
  assert.equal(r.seats, 2, "the two people in it");
  assert.equal(db.raw.prepare("SELECT seats FROM team WHERE id = 'tm'").get().seats, 2);

  // A team with nobody in it still gets a seat, so the number is never the "no limit" zero.
  db.raw.prepare("DELETE FROM membership WHERE team_id = 'tm'").run();
  const empty = await gift(db, { to: "team/acme", until: NEXT_YEAR, by: "boss", at: NOW });
  assert.equal(empty.seats, 1);
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

// ---- who is allowed to do any of this ----------------------------------------------------------

test("a super is one by the role on the account, and the deployment's list still works", async () => {
  const db = d1();
  seed(db);
  // Nobody, to begin with: a fresh deployment has no operator until one is made.
  assert.equal(await isAdmin(db, "", "ada"), false);
  await makeSuper(db, { account: "ada", by: "boss", at: NOW });
  assert.equal(await isAdmin(db, "", "ada"), true);
  // The secret is break-glass and bootstrap, checked beside the column and never instead of it:
  // it is how the first super is made, and how the last one gets back in.
  assert.equal(await isAdmin(db, "boss", "boss"), true);
  assert.equal(await isAdmin(db, "", "boss"), false);
});

test("being a super is permission to run the product, not to decide who else may", async () => {
  const db = d1();
  seed(db);
  await makeSuper(db, { account: "ada", by: "boss", at: NOW });
  // Ada runs the product: she can comp accounts and read what has been given.
  assert.equal(await isAdmin(db, "boss", "ada"), true);
  // She cannot make another one. Only the deployment's own list can, so an admin session somebody
  // walks up to cannot leave a permanent second owner behind.
  assert.equal(isPlatformOwner("boss", "ada"), false);
  assert.equal(isPlatformOwner("boss", "boss"), true);
  assert.equal(isPlatformOwner("", "boss"), false, "unset names nobody");
  assert.equal(isPlatformOwner("boss", ""), false);
});

test("a role says when it was given and by whom, and taking it back leaves the account alone", async () => {
  const db = d1();
  seed(db);
  // Two, because the last one cannot be removed — see the test below.
  await makeSuper(db, { account: "boss", by: "boss", at: NOW });
  await makeSuper(db, { account: "ada", by: "boss", at: NOW });
  const row = () => ({
    ...db.raw.prepare("SELECT role, role_since, role_by FROM account WHERE id = 'ada'").get(),
  });
  assert.deepEqual(row(), { role: "super", role_since: NOW, role_by: "boss" });

  const later = "2026-09-24T10:00:00.000Z";
  assert.equal((await unSuper(db, { account: "ada", by: "boss", at: later })).error, undefined);
  assert.deepEqual(row(), { role: "", role_since: later, role_by: "boss" });
  assert.equal(await isAdmin(db, "", "ada"), false);
  // The account itself is untouched: losing the role is not losing the guides.
  assert.equal(db.raw.prepare("SELECT id FROM account WHERE id = 'ada'").get().id, "ada");
  assert.match(
    (await unSuper(db, { account: "ada", by: "boss", at: later })).error,
    /not an admin/i,
  );
});

test("the last admin cannot take the role from themselves", async () => {
  // Otherwise the product has no operator and no way to make one without editing a secret and
  // redeploying — which is the thing the role exists to stop being the everyday answer.
  const db = d1();
  seed(db);
  await makeSuper(db, { account: "ada", by: "boss", at: NOW });
  const r = await unSuper(db, { account: "ada", by: "ada", at: NOW });
  assert.match(r.error, /last admin/i);
  assert.equal(await isAdmin(db, "", "ada"), true);
});

test("who the supers are, for the one listing there is", async () => {
  const db = d1();
  seed(db);
  await makeSuper(db, { account: "ada", by: "boss", at: NOW });
  const list = await superAccounts(db);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "ada");
  assert.equal(list[0].name, "Ada Lovelace");
  assert.equal(list[0].by, "boss");
});

// ---- the routes, read rather than imported (the app is not importable under type stripping) ----

const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const routes = index.slice(
  index.indexOf("// ---- giving a plan away"),
  index.indexOf("// ---- identity"),
);

test("every operator route is gated, and says nothing when the caller is not one", () => {
  assert.ok(routes.length > 0, "found the routes");
  // 404 rather than 403: a route nobody is the operator of should not confirm it exists.
  assert.match(routes, /isAdmin\(c\.env\.DB, c\.env\.ADMIN_ACCOUNTS, account\)/);
  const paths = [...routes.matchAll(/app\.(post|get|put|delete)\("\/v1\/admin\//g)].length;
  const gated =
    [...routes.matchAll(/err\(c, 404, "Not found\."\)/g)].length +
    [...routes.matchAll(/await platformOwner\(c\)/g)].length;
  assert.equal(paths, 8, "three for gifts, four for the admins, one picker behind the same gate");
  assert.equal(gated, paths, "each one checks first");
});

test("handing out the role is the deployment's to allow, and nothing else is", () => {
  // Making, granting and revoking a super: three of the four account routes. Reading who they are
  // is a super's business; changing who they are is not.
  assert.equal([...routes.matchAll(/await platformOwner\(c\)/g)].length, 3);
  assert.match(routes, /isPlatformOwner\(c\.env\.ADMIN_ACCOUNTS, account\)/);
  // A super who is not the owner is told why; anybody else keeps getting the answer that says
  // nothing about whether the route is there.
  assert.match(routes, /refuse: \(await operator\(c\)\) \? 403 : 404/);
  assert.match(routes, /Only the owner account can add or remove an admin/);
});

test("a subscription arriving clears the date a gift left behind", () => {
  // Otherwise a webhook would put somebody on a paid plan that expires on a day an operator typed
  // months earlier, and the charge would go on.
  const webhook = index.slice(
    index.indexOf("const soloId ="),
    index.indexOf('count(c, "plan_changed", { provider, plan: change.plan, subject: "team" })'),
  );
  assert.equal([...webhook.matchAll(/plan_until = ''/g)].length, 2, "the account's and the team's");
});
