// What waits on a person, against a real SQLite with every migration: the rank is the SQL, so this
// runs the SQL. Same small D1 stand-in as claims.test.mjs.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { changeWords, marksOf, needs, supportRequests, supportState } from "../src/needs.ts";
import { KINDS } from "../src/notify.ts";

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

const NOW = "2026-10-29T09:00:00.000Z";
const ago = (h) => new Date(Date.parse(NOW) - h * 3600e3).toISOString();

function world() {
  const db = d1();
  const x = (s) => db.raw.exec(s);
  x(`INSERT INTO account (id, token_hash, created, name, handle) VALUES
       ('ada', 'h1', '${ago(500)}', 'Ada', 'ada'), ('bo', 'h2', '${ago(500)}', 'Bo', 'bo'),
       ('cy', 'h3', '${ago(500)}', '', 'cy');
     INSERT INTO team (id, slug, name, created_by, created) VALUES ('t', 'acme', 'Acme', 'ada', '${ago(500)}');
     INSERT INTO membership (team_id, account_id, joined) VALUES
       ('t', 'ada', '${ago(500)}'), ('t', 'bo', '${ago(500)}');
     INSERT INTO team_group (id, team_id, slug, name, created) VALUES ('gw', 't', 'web', 'Web', '${ago(500)}');
     INSERT INTO group_member (group_id, account_id) VALUES ('gw', 'ada');`);
  const work = (id, o = {}) =>
    db.raw
      .prepare(
        `INSERT INTO work (id, account_id, share_key, title, status, markdown, created, updated, team_id,
                            to_account_id, to_group_id, customer, customer_name, outcome, summary)
         VALUES (?, ?, 'k', ?, ?, '', ?, ?, 't', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        o.by ?? "bo",
        `work ${id}`,
        o.status ?? "ready",
        o.created ?? ago(10),
        o.updated ?? ago(10),
        o.to ?? "",
        o.group ?? "",
        o.customer ?? "",
        o.customer_name ?? "",
        o.outcome ?? "",
        o.summary ?? "",
      );
  const ev = (workId, kind, at, account = "bo", body = "", agent = "") =>
    db.raw
      .prepare(
        "INSERT INTO task_event (work_id, kind, account_id, agent_id, body, at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(workId, kind, account, agent, body, at);
  const claim = (workId, account, agent, claimed, lease) =>
    db.raw
      .prepare(
        `INSERT INTO claim (work_id, account_id, agent_id, state, claimed_at, lease_until, updated)
         VALUES (?, ?, ?, 'claimed', ?, ?, ?)`,
      )
      .run(workId, account, agent, claimed, lease, claimed);
  return { db, x, work, ev, claim };
}

test("the register ranks customers, questions, stalls, untaken work and work that came back", async () => {
  const { db, work, ev, claim } = world();
  // Two customers waiting; the older one first. A third was answered after they last wrote.
  work("c1", { customer: "a@x.com", customer_name: "Ann", created: ago(30) });
  ev("c1", "customer", ago(30), "bo", "First message");
  ev("c1", "customer", ago(26), "bo", "Still   broken,\n  please help");
  work("c2", { customer: "b@x.com", created: ago(3) });
  work("c3", { customer: "c@x.com", created: ago(40) });
  ev("c3", "customer", ago(40));
  ev("c3", "answered", ago(39), "ada");
  // My agent is asking me something.
  work("q1", { by: "bo" });
  claim("q1", "ada", "agent-7", ago(5), new Date(Date.parse(NOW) + 3600e3).toISOString());
  ev("q1", "asked", ago(4), "ada", "Which database?", "agent-7");
  // Work I wrote whose agent went quiet.
  work("s1", { by: "ada" });
  claim("s1", "bo", "agent-9", ago(8), ago(2));
  // A live hold that is fine: not mine to worry about.
  work("ok", { by: "ada" });
  claim("ok", "bo", "agent-2", ago(1), new Date(Date.parse(NOW) + 3600e3).toISOString());
  // Sent to me and to my group, nobody took it.
  work("u1", { to: "ada", created: ago(50) });
  work("u2", { group: "gw", created: ago(20) });
  // Sent to somebody else: not mine.
  work("u3", { to: "bo" });
  // Mine, passed back by Bo.
  work("b1", { by: "ada" });
  ev("b1", "taken", ago(6), "bo");
  ev("b1", "passed", ago(5), "bo", "Not my area");
  // Mine, I passed it myself: not "came back".
  work("b2", { by: "ada" });
  ev("b2", "passed", ago(5), "ada", "later");
  // Drafts and Done work wait on nobody.
  work("d1", { to: "ada", status: "draft" });
  work("d2", { to: "ada", status: "done", outcome: "finished" });

  const { rows } = await needs(db, "ada", NOW);
  assert.deepEqual(
    rows.map((r) => [r.id, r.reason]),
    [
      ["c1", "customer"],
      ["c2", "customer"],
      ["q1", "asking"],
      ["s1", "stuck"],
      ["u1", "untaken"],
      ["u2", "untaken"],
      ["b1", "came_back"],
    ],
  );
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.c1.with, "Ann");
  assert.equal(by.c1.since, ago(26));
  assert.equal(by.c1.said, "Still broken, please help", "their latest words, on one line");
  assert.equal(by.c2.with, "b@x.com", "no name, so the address");
  assert.equal(by.q1.said, "Which database?");
  assert.equal(by.q1.with, "agent-7");
  assert.equal(by.s1.since, ago(2), "stalled from when the lease ran out");
  assert.equal(by.u2.with, "#web");
  assert.equal(by.b1.with, "Bo");
  assert.equal(by.b1.said, "Not my area");
});

test("one customer asking the same thing twice is one row, at the place of the older ask", async () => {
  const { db, x, work, ev } = world();
  work("o1", { customer: "ola@x.com", customer_name: "Ola Ben", created: ago(9) });
  ev("o1", "customer", ago(9), "bo", "Login fails");
  work("n1", { customer: "ann@x.com", created: ago(6) });
  ev("n1", "customer", ago(6), "bo", "Hi");
  work("o2", { customer: "OLA@x.com ", customer_name: "Ola Ben", created: ago(2) });
  ev("o2", "customer", ago(2), "bo", "Still fails");
  work("o3", { customer: "ola@x.com", customer_name: "Ola Ben", created: ago(1) });
  ev("o3", "customer", ago(1), "bo", "Another thing");
  x(`UPDATE work SET title = 'Login fails' WHERE id IN ('o1', 'o2');
     UPDATE work SET title = 'Invoice' WHERE id = 'o3';
     INSERT INTO notification (account_id, kind, work_id, at, read_at) VALUES
       ('ada', 'customer_wrote', 'o2', '${ago(2)}', '');`);
  const { rows } = await needs(db, "ada", NOW);
  assert.deepEqual(
    rows.map((r) => [r.id, r.also]),
    [
      ["o1", ["o2"]],
      ["n1", []],
      ["o3", []],
    ],
    "folded by address and title, the rank kept; a different title stays its own row",
  );
  assert.equal(rows[0].changed, "Customer wrote", "a change on the folded one still marks the row");
});

test("a row is changed while an unread notification is on it, and names the project", async () => {
  const { db, x, work } = world();
  work("u1", { to: "ada" });
  work("u2", { to: "ada" });
  x(`INSERT INTO notification (account_id, kind, work_id, at, read_at) VALUES
       ('ada', 'sent_to_you', 'u1', '${ago(1)}', ''), ('ada', 'reassigned', 'u2', '${ago(1)}', '${ago(0.5)}');
     INSERT INTO project (id, created_by, team_id, title, created, updated, color, parent_id) VALUES
       ('top', 'bo', 't', 'Website', '${ago(9)}', '${ago(9)}', 'blue', ''),
       ('sub', 'bo', 't', 'Pages', '${ago(9)}', '${ago(9)}', '', 'top'),
       ('hid', 'cy', '', 'Private', '${ago(9)}', '${ago(9)}', 'green', '');
     INSERT INTO project_work (project_id, work_id, added_by, added) VALUES
       ('sub', 'u1', 'bo', '${ago(9)}'), ('hid', 'u2', 'cy', '${ago(9)}');`);
  const { rows } = await needs(db, "ada", NOW);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.u1.changed, "Sent to you");
  assert.equal(by.u2.changed, "", "read already");
  assert.deepEqual(
    by.u1.project,
    { id: "top", title: "Website", color: "blue" },
    "the top project",
  );
  assert.equal(by.u2.project, null, "a project you cannot see names nothing");
});

test("a board card is marked with its project and its latest unread change, past D1's bind limit", async () => {
  const { db, x, work } = world();
  const ids = Array.from({ length: 120 }, (_, i) => `g${i}`);
  for (const id of ids) work(id);
  x(`INSERT INTO notification (account_id, kind, work_id, at, read_at) VALUES
       ('ada', 'task_claimed', 'g110', '${ago(3)}', ''), ('ada', 'task_finished', 'g110', '${ago(1)}', ''),
       ('ada', 'sent_to_you', 'g1', '${ago(1)}', '${ago(0.5)}'), ('bo', 'sent_to_you', 'g2', '${ago(1)}', '');
     INSERT INTO project (id, created_by, team_id, title, created, updated, color, parent_id) VALUES
       ('top', 'bo', 't', 'Billing app', '${ago(9)}', '${ago(9)}', 'teal', '');
     INSERT INTO project_work (project_id, work_id, added_by, added) VALUES ('top', 'g115', 'bo', '${ago(9)}');`);
  const marks = await marksOf(db, "ada", ids);
  assert.equal(marks.size, 120);
  assert.equal(marks.get("g110").changed, "Finished", "the latest unread one");
  assert.equal(marks.get("g1").changed, "", "read already");
  assert.equal(marks.get("g2").changed, "", "somebody else's notification");
  assert.deepEqual(marks.get("g115").project, { id: "top", title: "Billing app", color: "teal" });
  assert.equal(marks.get("g0").project, null);
});

test("customers and recent closes come beside the register", async () => {
  const { db, work, ev } = world();
  work("c1", { customer: "a@x.com", created: ago(30) });
  ev("c1", "customer", ago(30));
  ev("c1", "answered", ago(29), "ada");
  work("c2", { customer: "b@x.com", created: ago(2) });
  work("f1", { status: "done", outcome: "finished", updated: ago(8) });
  ev("f1", "handed_in", ago(8), "bo", "", "agent-3");
  work("f2", { status: "done", outcome: "archived", updated: ago(8) });
  work("f3", { status: "done", outcome: "finished", updated: ago(24 * 9) });
  const { customers, closed } = await needs(db, "ada", NOW);
  assert.deepEqual(
    customers.map((c) => [c.id, c.since]),
    [["c1", ago(29)]],
    "only those waiting on the customer, since we answered: the others are rows",
  );
  assert.deepEqual(
    closed.map((c) => [c.id, c.by]),
    [["f1", "agent-3"]],
    "finished lately, not archived, not old",
  );
});

test("every kind names what changed, and an unknown one still marks the row", () => {
  assert.equal(changeWords("pulled"), "Opened");
  assert.equal(changeWords("something_new"), "Changed");
  for (const k of KINDS) assert.notEqual(changeWords(k), "Changed", `${k} has words`);
  assert.equal(changeWords(""), "");
});

test("a request's place in the Support table comes from what happened to it", () => {
  const st = (o) =>
    supportState({ done: false, lastBy: "customer", answered: false, openWork: 0, ...o });
  assert.equal(st({}), "new", "the customer wrote and nobody has answered");
  assert.equal(
    st({ openWork: 1 }),
    "new",
    "nobody has answered: a fix being open does not hide them",
  );
  assert.equal(st({ answered: true, lastBy: "team" }), "waiting", "our word was last");
  assert.equal(
    st({ answered: true, lastBy: "customer", openWork: 1 }),
    "needs_reply",
    "the customer wrote again: they need a reply even while the fix is open",
  );
  assert.equal(st({ answered: true, lastBy: "team", openWork: 1 }), "with_development");
  assert.equal(st({ done: true, lastBy: "customer", answered: true }), "solved");
});

test("the Support list: state, their latest words, how long and whether too long, project and change", async () => {
  const { db, x, work, ev } = world();
  const WAIT = 4 * 3600e3;
  work("r1", { customer: "a@x.com", customer_name: "Ann", created: ago(30) });
  ev("r1", "customer", ago(30), "bo", "It   broke");
  ev("r1", "answered", ago(29), "ada", "Looking");
  ev("r1", "customer", ago(6), "bo", "Still\nbroken");
  work("r2", { customer: "b@x.com", created: ago(2) });
  ev("r2", "customer", ago(2), "bo", "Hello");
  work("r3", { customer: "c@x.com", created: ago(20) });
  ev("r3", "customer", ago(20), "bo", "Where is it");
  ev("r3", "answered", ago(19), "ada", "On its way");
  work("r4", { customer: "d@x.com", status: "done", outcome: "archived" });
  work("w1");
  // Unanswered with a fix open: still New, still waiting on us.
  work("r5", { customer: "e@x.com", created: ago(9) });
  ev("r5", "customer", ago(9), "bo", "Broken");
  x(`UPDATE work SET parent_id = 'r5' WHERE id = 'w1'`);
  // Answered with a fix open: with development.
  work("r6", { customer: "f@x.com", created: ago(9) });
  ev("r6", "customer", ago(9), "bo", "Also broken");
  ev("r6", "answered", ago(8), "ada", "On it");
  work("w2");
  x(`UPDATE work SET parent_id = 'r6' WHERE id = 'w2'`);
  // Event ids that run opposite to their times (an import, a backfill): time decides.
  work("r7", { customer: "g@x.com", created: ago(9) });
  ev("r7", "customer", ago(3), "bo", "Wrote last");
  ev("r7", "answered", ago(5), "ada", "Answered first");
  x(`UPDATE work SET team_id = '' , account_id = 'cy' WHERE id = 'r4';
     INSERT INTO notification (account_id, kind, work_id, at, read_at) VALUES
       ('ada', 'customer_wrote', 'r1', '${ago(6)}', '');
     INSERT INTO project (id, created_by, team_id, title, created, updated, color, parent_id) VALUES
       ('p', 'bo', 't', 'Billing app', '${ago(9)}', '${ago(9)}', 'teal', '');
     INSERT INTO project_work (project_id, work_id, added_by, added) VALUES ('p', 'r2', 'bo', '${ago(9)}');
     UPDATE membership SET role = 'owner' WHERE account_id = 'ada';
     UPDATE team SET tell_customer = 1;`);
  const { requests, teams } = await supportRequests(db, "ada", NOW, WAIT);
  const by = Object.fromEntries(requests.map((r) => [r.id, r]));
  assert.deepEqual(
    Object.keys(by).sort(),
    ["r1", "r2", "r3", "r5", "r6", "r7"],
    "customers only, and only visible ones",
  );
  assert.equal(by.r5.state, "new", "unanswered, though a fix is open");
  assert.equal(by.r5.waiting_since, ago(9), "and its age shows");
  assert.equal(by.r6.state, "with_development");
  assert.equal(by.r6.waiting_since, "");
  assert.equal(by.r7.state, "needs_reply", "the later message is theirs, whatever the ids say");
  assert.equal(by.r7.last.by, "customer");
  assert.equal(by.r7.waiting_since, ago(3));
  assert.equal(by.r1.state, "needs_reply");
  assert.equal(by.r1.said, "Still broken", "their own latest words, on one line");
  assert.equal(by.r1.waiting_since, ago(6));
  assert.equal(by.r1.late, true, "past the reminder");
  assert.equal(by.r1.changed, "Customer wrote");
  assert.equal(by.r1.customer.name, "Ann");
  assert.equal(by.r2.state, "new");
  assert.equal(by.r2.late, false);
  assert.deepEqual(by.r2.project, { id: "p", title: "Billing app", color: "teal" });
  assert.equal(by.r3.state, "waiting");
  assert.equal(by.r3.waiting_since, "", "the next word is theirs");
  assert.equal(by.r3.said, "Where is it");
  assert.equal(by.r3.last.by, "team");
  assert.equal(by.r3.project, null);
  assert.equal(by.r3.tell, true);
  assert.deepEqual(
    teams,
    [{ slug: "acme", name: "Acme", tell: true }],
    "the teams this owner can set",
  );
});
