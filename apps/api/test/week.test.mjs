// What was finished last week, against a real SQLite with every migration: the window and who
// sees what are the SQL, so this runs the SQL. Same small D1 stand-in as needs.test.mjs.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { lastWeek, weekToMail } from "../src/week.ts";

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
        run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
      });
      return { ...bound([]), bind: (...args) => bound(args) };
    },
  };
}

// Monday 16 Nov 2026, 08:17 UTC: last week is Mon 9 Nov to Sun 15 Nov.
const NOW = "2026-11-16T08:17:00.000Z";
const OLD = "2026-01-01T00:00:00.000Z";

test("lastWeek is the Monday-to-Monday before the week `at` is in", () => {
  const week = { from: "2026-11-09T00:00:00.000Z", to: "2026-11-16T00:00:00.000Z" };
  assert.deepEqual(lastWeek(NOW), week);
  assert.deepEqual(lastWeek("2026-11-22T23:59:00.000Z"), week);
});

test("each person gets the finished work they could see, once, oldest first", async () => {
  const db = d1();
  db.raw.exec(`
    INSERT INTO account (id, token_hash, created, name, handle, email) VALUES
      ('mark', 'h1', '${OLD}', 'Mark', 'mark', 'mark@x.test'),
      ('bo', 'h2', '${OLD}', '', 'bo', 'bo@x.test'),
      ('cy', 'h3', '${OLD}', 'Cy', 'cy', 'cy@x.test'),
      ('dee', 'h4', '${OLD}', 'Dee', 'dee', '');
    INSERT INTO team (id, slug, name, created_by, created) VALUES ('t', 'acme', 'Acme', 'mark', '${OLD}');
    INSERT INTO membership (team_id, account_id, joined) VALUES
      ('t', 'mark', '${OLD}'), ('t', 'bo', '${OLD}'), ('t', 'dee', '${OLD}');`);
  const work = (id, by, team, status, outcome) =>
    db.raw
      .prepare(
        `INSERT INTO work (id, account_id, share_key, title, status, markdown, created, updated, team_id, outcome, summary)
         VALUES (?, ?, 'k', ?, ?, '', '${OLD}', '${OLD}', ?, ?, '')`,
      )
      .run(id, by, `work ${id}`, status, team, outcome);
  const proof = (id, by, at) =>
    db.raw
      .prepare("INSERT INTO proof (work_id, account_id, ok, at) VALUES (?, ?, 1, ?)")
      .run(id, by, at);
  work("late", "mark", "t", "done", "finished");
  proof("late", "bo", "2026-11-15T23:00:00.000Z");
  work("early", "mark", "t", "done", "finished");
  proof("early", "mark", "2026-11-09T00:00:00.000Z");
  proof("early", "bo", "2026-11-10T00:00:00.000Z"); // a second proof lists it once
  work("before", "mark", "t", "done", "finished");
  proof("before", "mark", "2026-11-08T23:59:00.000Z"); // the week before
  work("this", "mark", "t", "done", "finished");
  proof("this", "mark", "2026-11-16T01:00:00.000Z"); // this week, mailed next Monday
  work("closed", "mark", "t", "done", "archived");
  proof("closed", "mark", "2026-11-10T00:00:00.000Z"); // archived is not finished
  work("reopened", "mark", "t", "ready", "");
  proof("reopened", "mark", "2026-11-10T00:00:00.000Z"); // reopened since
  work("mine", "cy", "", "done", "finished");
  proof("mine", "cy", "2026-11-12T00:00:00.000Z"); // private: only its author

  const mails = await weekToMail(db, NOW);
  const by = Object.fromEntries(mails.map((m) => [m.account_id, m]));
  assert.deepEqual(Object.keys(by).sort(), ["bo", "cy", "mark"]); // dee has no address
  const teamWork = [
    { id: "early", title: "work early", by: "Mark", at: "2026-11-09T00:00:00.000Z" },
    { id: "late", title: "work late", by: "bo", at: "2026-11-15T23:00:00.000Z" },
  ];
  assert.deepEqual(by.mark.work, teamWork);
  assert.deepEqual(by.bo.work, teamWork);
  assert.equal(by.mark.email, "mark@x.test");
  assert.deepEqual(
    by.cy.work.map((w) => w.id),
    ["mine"],
  );

  // Turned off in Settings: no mail.
  db.raw.exec("UPDATE account SET week_mail_off = '2026-11-10T00:00:00.000Z' WHERE id = 'bo'");
  assert.deepEqual((await weekToMail(db, NOW)).map((m) => m.account_id).sort(), ["cy", "mark"]);
});
