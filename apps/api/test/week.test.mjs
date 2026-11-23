// What was finished last week, against a real SQLite with every migration: the window and who
// sees what are the SQL, so this runs the SQL. Same small D1 stand-in as needs.test.mjs.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { byProject, firstSentence, lastWeek, weekToMail } from "../src/week.ts";

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
    {
      id: "early",
      title: "work early",
      by: "Mark",
      at: "2026-11-09T00:00:00.000Z",
      said: "work early",
      project: "",
    },
    {
      id: "late",
      title: "work late",
      by: "bo",
      at: "2026-11-15T23:00:00.000Z",
      said: "work late",
      project: "",
    },
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

test("each piece is told in its finisher's words, under a project the reader can see", async () => {
  const db = d1();
  db.raw.exec(`
    INSERT INTO account (id, token_hash, created, name, handle, email) VALUES
      ('mark', 'h1', '${OLD}', 'Mark', 'mark', 'mark@x.test'),
      ('bo', 'h2', '${OLD}', 'Bo', 'bo', 'bo@x.test');
    INSERT INTO team (id, slug, name, created_by, created) VALUES ('t', 'acme', 'Acme', 'mark', '${OLD}');
    INSERT INTO membership (team_id, account_id, joined) VALUES ('t', 'mark', '${OLD}'), ('t', 'bo', '${OLD}');
    INSERT INTO work (id, account_id, share_key, title, status, markdown, created, updated, team_id, outcome, summary) VALUES
      ('a', 'mark', 'k', 'Coupons', 'done', '', '${OLD}', '${OLD}', 't', 'finished', 'Coupons fail. At checkout.'),
      ('b', 'mark', 'k', 'Popup', 'done', '', '${OLD}', '${OLD}', 't', 'finished', 'The popup.');
    INSERT INTO proof (work_id, account_id, ok, at, writeup) VALUES
      ('a', 'bo', 1, '2026-11-10T00:00:00.000Z', 'Coupons apply at checkout again. Tests pass.'),
      ('b', 'bo', 1, '2026-11-11T00:00:00.000Z', '');
    INSERT INTO project (id, created_by, team_id, title, created, updated) VALUES
      ('pt', 'mark', 't', 'Bellavida', '${OLD}', '${OLD}'),
      ('pm', 'mark', '', 'Mark private', '${OLD}', '${OLD}');
    INSERT INTO project_work (project_id, work_id, added_by, added) VALUES
      ('pt', 'a', 'mark', '${OLD}'), ('pm', 'b', 'mark', '${OLD}');`);
  const by = Object.fromEntries((await weekToMail(db, NOW)).map((m) => [m.account_id, m.work]));
  assert.deepEqual(
    by.bo.map((w) => [w.said, w.project]),
    [
      ["Coupons apply at checkout again.", "Bellavida"],
      ["The popup.", ""], // no write-up: the summary; Mark's private project is not Bo's to see
    ],
  );
  assert.equal(by.mark[1].project, "Mark private");
});

test("firstSentence keeps one sentence of somebody's words, and byProject puts the unfiled last", () => {
  assert.equal(firstSentence("Fixed it.  Then\nmore."), "Fixed it.");
  assert.equal(firstSentence("v1.2 shipped"), "v1.2 shipped");
  const long = firstSentence("word ".repeat(60));
  assert.ok(long.length <= 201 && long.endsWith("…"));
  const w = (id, project) => ({ id, project });
  assert.deepEqual(
    byProject([w(1, ""), w(2, "B"), w(3, "A"), w(4, "B")]).map((g) => [
      g.project,
      g.work.map((x) => x.id),
    ]),
    [
      ["B", [2, 4]],
      ["A", [3]],
      ["", [1]],
    ],
  );
});
