// What waits on a person, against a real SQLite with every migration: the rank is the SQL, so this
// runs the SQL. Same small D1 stand-in as claims.test.mjs.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { changeWords, marksOf, needs } from "../src/needs.ts";
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
  const guide = (id, o = {}) =>
    db.raw
      .prepare(
        `INSERT INTO guide (id, account_id, share_key, title, status, markdown, created, updated, team_id,
                            to_account_id, to_group_id, customer, customer_name, outcome, summary)
         VALUES (?, ?, 'k', ?, ?, '', ?, ?, 't', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        o.by ?? "bo",
        `work ${id}`,
        o.status ?? "published",
        o.created ?? ago(10),
        o.updated ?? ago(10),
        o.to ?? "",
        o.group ?? "",
        o.customer ?? "",
        o.customer_name ?? "",
        o.outcome ?? "",
        o.summary ?? "",
      );
  const ev = (guideId, kind, at, account = "bo", body = "", agent = "") =>
    db.raw
      .prepare(
        "INSERT INTO task_event (guide_id, kind, account_id, agent_id, body, at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(guideId, kind, account, agent, body, at);
  const claim = (guideId, account, agent, claimed, lease) =>
    db.raw
      .prepare(
        `INSERT INTO claim (guide_id, account_id, agent_id, state, claimed_at, lease_until, updated)
         VALUES (?, ?, ?, 'claimed', ?, ?, ?)`,
      )
      .run(guideId, account, agent, claimed, lease, claimed);
  return { db, x, guide, ev, claim };
}

test("the register ranks customers, questions, stalls, untaken work and work that came back", async () => {
  const { db, guide, ev, claim } = world();
  // Two customers waiting; the older one first. A third was answered after they last wrote.
  guide("c1", { customer: "a@x.com", customer_name: "Ann", created: ago(30) });
  ev("c1", "customer", ago(30), "bo", "First message");
  ev("c1", "customer", ago(26), "bo", "Still   broken,\n  please help");
  guide("c2", { customer: "b@x.com", created: ago(3) });
  guide("c3", { customer: "c@x.com", created: ago(40) });
  ev("c3", "customer", ago(40));
  ev("c3", "answered", ago(39), "ada");
  // My agent is asking me something.
  guide("q1", { by: "bo" });
  claim("q1", "ada", "agent-7", ago(5), new Date(Date.parse(NOW) + 3600e3).toISOString());
  ev("q1", "asked", ago(4), "ada", "Which database?", "agent-7");
  // Work I wrote whose agent went quiet.
  guide("s1", { by: "ada" });
  claim("s1", "bo", "agent-9", ago(8), ago(2));
  // A live hold that is fine: not mine to worry about.
  guide("ok", { by: "ada" });
  claim("ok", "bo", "agent-2", ago(1), new Date(Date.parse(NOW) + 3600e3).toISOString());
  // Sent to me and to my group, nobody took it.
  guide("u1", { to: "ada", created: ago(50) });
  guide("u2", { group: "gw", created: ago(20) });
  // Sent to somebody else: not mine.
  guide("u3", { to: "bo" });
  // Mine, passed back by Bo.
  guide("b1", { by: "ada" });
  ev("b1", "taken", ago(6), "bo");
  ev("b1", "passed", ago(5), "bo", "Not my area");
  // Mine, I passed it myself: not "came back".
  guide("b2", { by: "ada" });
  ev("b2", "passed", ago(5), "ada", "later");
  // Drafts and Done work wait on nobody.
  guide("d1", { to: "ada", status: "draft" });
  guide("d2", { to: "ada", status: "consumed", outcome: "finished" });

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

test("a row is changed while an unread notification is on it, and names the project", async () => {
  const { db, x, guide } = world();
  guide("u1", { to: "ada" });
  guide("u2", { to: "ada" });
  x(`INSERT INTO notification (account_id, kind, guide_id, at, read_at) VALUES
       ('ada', 'handoff', 'u1', '${ago(1)}', ''), ('ada', 'reassigned', 'u2', '${ago(1)}', '${ago(0.5)}');
     INSERT INTO folder (id, created_by, team_id, title, created, updated, color, parent_id) VALUES
       ('top', 'bo', 't', 'Website', '${ago(9)}', '${ago(9)}', 'blue', ''),
       ('sub', 'bo', 't', 'Pages', '${ago(9)}', '${ago(9)}', '', 'top'),
       ('hid', 'cy', '', 'Private', '${ago(9)}', '${ago(9)}', 'green', '');
     INSERT INTO folder_guide (folder_id, guide_id, added_by, added) VALUES
       ('sub', 'u1', 'bo', '${ago(9)}'), ('hid', 'u2', 'cy', '${ago(9)}');`);
  const { rows } = await needs(db, "ada", NOW);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.u1.changed, "Sent to you");
  assert.equal(by.u2.changed, "", "read already");
  assert.deepEqual(by.u1.project, { id: "top", title: "Website", color: "blue" }, "the top folder");
  assert.equal(by.u2.project, null, "a folder you cannot see names nothing");
});

test("a board card is marked with its project and its latest unread change, past D1's bind limit", async () => {
  const { db, x, guide } = world();
  const ids = Array.from({ length: 120 }, (_, i) => `g${i}`);
  for (const id of ids) guide(id);
  x(`INSERT INTO notification (account_id, kind, guide_id, at, read_at) VALUES
       ('ada', 'task_claimed', 'g110', '${ago(3)}', ''), ('ada', 'task_finished', 'g110', '${ago(1)}', ''),
       ('ada', 'handoff', 'g1', '${ago(1)}', '${ago(0.5)}'), ('bo', 'handoff', 'g2', '${ago(1)}', '');
     INSERT INTO folder (id, created_by, team_id, title, created, updated, color, parent_id) VALUES
       ('top', 'bo', 't', 'Billing app', '${ago(9)}', '${ago(9)}', 'teal', '');
     INSERT INTO folder_guide (folder_id, guide_id, added_by, added) VALUES ('top', 'g115', 'bo', '${ago(9)}');`);
  const marks = await marksOf(db, "ada", ids);
  assert.equal(marks.size, 120);
  assert.equal(marks.get("g110").changed, "Finished", "the latest unread one");
  assert.equal(marks.get("g1").changed, "", "read already");
  assert.equal(marks.get("g2").changed, "", "somebody else's notification");
  assert.deepEqual(marks.get("g115").project, { id: "top", title: "Billing app", color: "teal" });
  assert.equal(marks.get("g0").project, null);
});

test("customers and recent closes come beside the register", async () => {
  const { db, guide, ev } = world();
  guide("c1", { customer: "a@x.com", created: ago(30) });
  ev("c1", "customer", ago(30));
  ev("c1", "answered", ago(29), "ada");
  guide("c2", { customer: "b@x.com", created: ago(2) });
  guide("f1", { status: "consumed", outcome: "finished", updated: ago(8) });
  ev("f1", "handed_in", ago(8), "bo", "", "agent-3");
  guide("f2", { status: "consumed", outcome: "archived", updated: ago(8) });
  guide("f3", { status: "consumed", outcome: "finished", updated: ago(24 * 9) });
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
