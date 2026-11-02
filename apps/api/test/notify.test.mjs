// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { displayName, KINDS, line, summary } from "../src/notify.ts";

test("a person is named by their name, then their handle, then their account id", () => {
  assert.equal(displayName({ id: "acc_1", handle: "ada", name: "Ada Lovelace" }), "Ada Lovelace");
  assert.equal(displayName({ id: "acc_1", handle: "ada", name: "  Ada  " }), "Ada");
  // A name that is only spaces is not a name.
  assert.equal(displayName({ id: "acc_1", handle: "ada", name: "   " }), "@ada");
  assert.equal(displayName({ id: "acc_1", handle: "ada", name: null }), "@ada");
  assert.equal(displayName({ id: "acc_1", handle: "", name: "" }), "@acc_1");
  assert.equal(displayName({ id: "acc_1", handle: null, name: null }), "@acc_1");
  // A real account is never "someone": that word is kept for a reader with no account at all.
  assert.doesNotMatch(displayName({ id: "x", handle: "", name: "" }), /someone/);
});

test("a notification carries the actor and the team as a person reads them", () => {
  const named = summary(row({ actor_real: "Bob Marley", team_name: "Khaime" }));
  assert.equal(named.actor_name, "Bob Marley");
  assert.equal(named.actor, "bob", "the handle stays for anything that already reads it");
  assert.equal(named.team_name, "Khaime");
  assert.equal(named.team, "khaime");
  assert.equal(summary(row({ actor_real: "" })).actor_name, "@bob");
  assert.equal(summary(row({ actor: "", actor_real: "" })).actor_name, "@acc_bob");
  // Nobody at all: an anonymous share-link reader has no name to give.
  assert.equal(summary(row({ actor_id: "", actor: "", actor_real: "" })).actor_name, "");
});

const row = (over = {}) => ({
  id: 1,
  kind: "pulled",
  work_id: "k3mq2xa7",
  actor_id: "acc_bob",
  team_id: "t1",
  at: "2026-09-04T10:00:00.000Z",
  times: 1,
  read_at: "",
  note: "",
  title: "Add Paystack webhook verification",
  actor: "bob",
  team: "khaime",
  ...over,
});

test("every kind renders a sentence naming who did what", () => {
  // Except one. `stalled` is the only event nobody caused, so it is the only sentence that does
  // not open with an actor — see the case in line().

  const seen = KINDS.map((kind) => line(row({ kind })));
  assert.deepEqual(seen, [
    '@bob sent you "Add Paystack webhook verification" in khaime',
    '@bob shared "Add Paystack webhook verification" with khaime',
    '@bob passed on "Add Paystack webhook verification"',
    '@bob opened "Add Paystack webhook verification"',
    '@bob archived "Add Paystack webhook verification"',
    '@bob reopened "Add Paystack webhook verification"',
    "@bob joined khaime",
    "@bob made you an admin of khaime",
    "@bob removed you from khaime",
    '@bob\'s agent took "Add Paystack webhook verification"',
    '@bob\'s agent finished "Add Paystack webhook verification"',
    '@bob took "Add Paystack webhook verification" back from your agent',
    '@bob gave "Add Paystack webhook verification" to someone else',
    '"Add Paystack webhook verification" has gone quiet — nobody has heard from whoever holds it',
    '"Add Paystack webhook verification" went back to Draft — nobody took it',
    '"Add Paystack webhook verification" is still a draft — nobody can take it until you mark it Ready',
    '"Add Paystack webhook verification" went quiet, so it is back in the queue for anyone to take',
    '"Add Paystack webhook verification" has gone quiet more than once — it needs a person to step in',
    'Nobody has taken "Add Paystack webhook verification" — give it to someone, take it, or archive it',
    'The customer wrote again on "Add Paystack webhook verification"',
    'Passalong couldn\'t sort "Add Paystack webhook verification" by itself',
    'A customer has waited four hours on "Add Paystack webhook verification" and nobody has picked it up',
    'Work made from "Add Paystack webhook verification" has ended',
    '@bob\'s agent has a question about "Add Paystack webhook verification"',
    '@bob replied to your agent on "Add Paystack webhook verification"',
    'The agent holding "Add Paystack webhook verification" is stuck on you',
    "@bob signed up",
    "Two subscriptions are paying for one plan. Refund one in Bachs",
    // Both actorless: a machine sent them, so neither names a person.
    'An email became "Add Paystack webhook verification"',
    "A new sender wants to email you work. Allow or block it in Settings",
    '"Add Paystack webhook verification" came in from a webhook',
  ]);
});

test("a person's name and a team's name win over their handle and slug", () => {
  const named = (over) => line(row({ actor_real: "Hybee1", team_name: "Khaime", ...over }));
  assert.equal(
    named({ kind: "sent_to_you" }),
    'Hybee1 sent you "Add Paystack webhook verification" in Khaime',
  );
  assert.equal(named({ kind: "joined" }), "Hybee1 joined Khaime");
  assert.equal(named({ kind: "passed" }), 'Hybee1 passed on "Add Paystack webhook verification"');
  assert.equal(named({ kind: "archived" }), 'Hybee1 archived "Add Paystack webhook verification"');
});

test("a room is never told 'you': work sent there says who it went to", () => {
  const text = line({
    kind: "sent_to_you",
    actor_name: "Hybee1",
    title: "Add Paystack webhook verification",
    team_name: "Khaime",
    to: "Ada",
    times: 1,
  });
  assert.equal(text, 'Hybee1 sent "Add Paystack webhook verification" to Ada in Khaime');
  assert.doesNotMatch(text, /\byou\b/);
  assert.equal(
    line({ kind: "shared", actor_name: "Hybee1", title: "X", team_name: "Khaime", times: 1 }),
    'Hybee1 shared "X" with Khaime',
  );
});

test("a reopen carries its reason into the line", () => {
  const r = row({ kind: "reopened", note: "toggle does nothing on Safari" });
  assert.equal(
    line(r),
    '@bob reopened "Add Paystack webhook verification": toggle does nothing on Safari',
  );
  assert.equal(summary(r).note, "toggle does nothing on Safari");
  // A reason is the point of reopening; without one the line still reads.
  assert.doesNotMatch(line(row({ kind: "reopened" })), /:\s*$/);
});

test("an anonymous share-link reader is the only 'Someone'", () => {
  assert.equal(
    line(row({ actor: "", actor_id: "" })),
    'Someone opened "Add Paystack webhook verification"',
  );
  // An account with no handle and no name is still an account, and is named by its id.
  assert.equal(line(row({ actor: "" })), '@acc_bob opened "Add Paystack webhook verification"');
});

test("repeat opens read as one line that says how many times", () => {
  assert.equal(line(row({ times: 4 })), '@bob opened "Add Paystack webhook verification" 4 times');
  assert.doesNotMatch(line(row({ times: 1 })), /times|×/, "a single event carries no count");
  // Only opens repeat in practice; sending says nothing about how many times it was addressed.
  assert.doesNotMatch(line(row({ kind: "sent_to_you", times: 3 })), /times|×/);
});

test("a piece of work that has since been deleted still reads", () => {
  assert.equal(line(row({ title: "" })), "@bob opened untitled work");
});

test("no sentence uses the words the product retired", () => {
  const everything = KINDS.flatMap((kind) => [
    line(row({ kind })),
    line(row({ kind, note: "why", times: 3 })),
  ]).join("\n");
  for (const word of [/pulled/, /consumed/, /handed/, /verified/, /promote/, /×/, /someone with/]) {
    assert.doesNotMatch(everything, word);
  }
});

test("summary carries the rendered line and the read flag", () => {
  const s = summary(row({ read_at: "2026-09-04T11:00:00.000Z" }));
  assert.equal(s.work, "k3mq2xa7");
  assert.equal(s.read, true);
  assert.equal(s.text, line(row()));
  assert.equal(summary(row()).read, false);
});

test("a decline carries its reason, because that is the whole point of saying no", () => {
  const r = row({ kind: "passed", note: "no context on the payments side" });
  assert.equal(
    line(r),
    '@bob passed on "Add Paystack webhook verification": no context on the payments side',
  );
  assert.equal(summary(r).note, "no context on the payments side");
});

test("a deleted work takes its unread feed rows, keeps what was read, and says who may have heard", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { forgetWork } = await import("../src/notify.ts");
  const dir = new URL("../migrations/", import.meta.url).pathname;
  const sql = new DatabaseSync(":memory:");
  for (const f of readdirSync(dir).sort()) sql.exec(readFileSync(join(dir, f), "utf8"));
  const db = {
    prepare(q) {
      const stmt = sql.prepare(q);
      const bound = (args) => ({
        first: async () => stmt.get(...args) ?? null,
        all: async () => ({ results: stmt.all(...args) }),
        run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
      });
      return { ...bound([]), bind: (...args) => bound(args) };
    },
  };
  const T = "2026-10-30T00:00:00.000Z";
  for (const a of ["ada", "bola", "kemi", "sam"])
    sql
      .prepare("INSERT INTO account (id, token_hash, created) VALUES (?, ?, ?)")
      .run(a, `retired:${a}`, T);
  const add = sql.prepare(
    "INSERT INTO notification (account_id, kind, work_id, actor_id, at, read_at, emailed_at) VALUES (?, ?, ?, 'ada', ?, ?, ?)",
  );
  add.run("bola", "sent_to_you", "g1", T, "", T); // mailed and pushed
  add.run("kemi", "sent_to_you", "g1", T, T, ""); // read already: kept
  add.run("sam", "pulled", "g1", T, "", ""); // neither mailed nor a pushed kind
  add.run("bola", "sent_to_you", "g2", T, "", ""); // another work: untouched
  const { told } = await forgetWork(db, "g1");
  assert.equal(told, 2, "bola and kemi may have heard; sam's kind is never pushed or mailed");
  const left = sql
    .prepare("SELECT account_id, work_id FROM notification ORDER BY work_id, account_id")
    .all();
  assert.deepEqual(
    left.map((r) => `${r.work_id}:${r.account_id}`),
    ["g1:kemi", "g2:bola"],
  );
});
