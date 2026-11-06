// An agent asking with options to pick from (2026-11-06): two to four, each a label, a line and a
// screenshot; written out in the question's text for whoever reads only text, and kept as JSON for
// the hub to draw as cards with Choose. Real SQLite with every migration.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { ask, CHOICES_MAX, choicesOf, thread, withChoices } from "../src/claims.ts";

const T0 = "2026-11-06T10:00:00.000Z";
const A = { account: "me", agent: "agent-a", repo: "o/r" };

function d1() {
  const sql = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) sql.exec(readFileSync(new URL(f, dir), "utf8"));
  sql.prepare("INSERT INTO account (id, token_hash, created) VALUES ('me', 'h', ?)").run(T0);
  sql
    .prepare(
      `INSERT INTO work (id, account_id, share_key, title, status, source_context, tags, stack,
                          markdown, created, updated, target)
       VALUES ('w1', 'me', 'k', 'Pick a layout', 'ready', '', '[]', '[]', '', ?, ?, 'o/r')`,
    )
    .run(T0, T0);
  sql
    .prepare(
      `INSERT INTO claim (work_id, account_id, agent_id, state, claimed_at, lease_until, updated)
       VALUES ('w1', 'me', 'agent-a', 'claimed', ?, ?, ?)`,
    )
    .run(T0, "2026-11-06T11:00:00.000Z", T0);
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
  return db;
}

const TWO = [
  { label: "Two columns", detail: "Filters on the left", picture: "/v1/shots/abc123def" },
  {
    label: "One column",
    detail: "Filters in a drawer",
    picture: "https://passalong.dev/v1/shots/xyz789uvw",
  },
];

test("options are checked: two to four, each labelled, pictures only our own screenshots", () => {
  assert.deepEqual(choicesOf(undefined), { list: [] }, "none is an ordinary question");
  assert.equal(choicesOf(TWO).list.length, 2);
  assert.match(choicesOf([TWO[0]]).error, /two to 4/);
  assert.equal(CHOICES_MAX, 4);
  assert.match(choicesOf([...TWO, ...TWO, TWO[0]]).error, /two to 4/);
  assert.match(choicesOf([TWO[0], { label: "" }]).error, /choice 2 needs a label/);
  assert.match(
    choicesOf([TWO[0], { label: "B", picture: "https://evil.example/x.png" }]).error,
    /add_file/,
    "never a stranger's image in the hub",
  );
});

test("the question's text writes the options out, with their pictures", () => {
  const text = withChoices("Which layout?", choicesOf(TWO).list);
  assert.match(
    text,
    /^Which layout\?\n\nThe choices:\n1\. Two columns: Filters on the left\n {3}!\[Two columns\]\(\/v1\/shots\/abc123def\)/,
  );
  assert.match(text, /2\. One column: Filters in a drawer/);
  assert.equal(withChoices("Plain?", []), "Plain?");
});

test("asking with options keeps them for the hub's buttons", async () => {
  const db = d1();
  const r = await ask(db, "w1", A, { at: T0, question: "Which layout?", choices: TWO });
  assert.ok(r.claim, "it still holds the work");
  const asked = (await thread(db, "w1", "me")).find((e) => e.kind === "asked");
  assert.deepEqual(
    asked.choices.map((c) => c.label),
    ["Two columns", "One column"],
  );
  assert.match(asked.body, /The choices:/, "and its text says them too");
  const bad = await ask(db, "w1", A, { at: T0, question: "Which?", choices: [TWO[0]] });
  assert.equal(bad.status, 400);
});

test("a question without options is unchanged", async () => {
  const db = d1();
  await ask(db, "w1", A, { at: T0, question: "Settings or header?" });
  const asked = (await thread(db, "w1", "me")).find((e) => e.kind === "asked");
  assert.equal(asked.body, "Settings or header?");
  assert.equal(asked.choices, undefined);
});
