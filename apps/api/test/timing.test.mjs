// Every API answer says what it cost, and a slow one is logged by route (src/timing.ts). The hub
// felt slow and only the network could be measured from outside (2026-11-06).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { routeOf, SLOW_MS, serverTiming, timedDB } from "../src/timing.ts";

/** A stand-in for D1: statements made by `prepare`, bound by `bind`, and run as D1 runs them. */
function fakeD1() {
  const ran = [];
  const made = new Set();
  class Statement {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
      made.add(this);
    }
    bind(...args) {
      return new Statement(this.sql, args);
    }
    async first() {
      ran.push(this.sql);
      return { sql: this.sql, args: this.args };
    }
    async all() {
      ran.push(this.sql);
      return { results: [this.args] };
    }
    async run() {
      ran.push(this.sql);
      return { meta: { changes: 1 } };
    }
  }
  return {
    ran,
    made,
    db: {
      prepare: (sql) => new Statement(sql),
      async batch(statements) {
        for (const s of statements)
          assert.ok(made.has(s), "a batch gets the binding's own statements");
        return statements.map((s) => ({ results: [s.sql] }));
      },
      dump: () => "not timed",
    },
  };
}

test("each statement is counted and timed, and its answer comes back as it was", async () => {
  const { db, ran } = fakeD1();
  const t = { queries: 0, db: 0 };
  let now = 0;
  const DB = timedDB(db, t, () => (now += 5));
  assert.deepEqual(await DB.prepare("SELECT 1 WHERE a = ?").bind(7).first(), {
    sql: "SELECT 1 WHERE a = ?",
    args: [7],
  });
  assert.deepEqual(await DB.prepare("SELECT 2").all(), { results: [[]] });
  await DB.prepare("UPDATE x").bind(1).run();
  assert.deepEqual(ran, ["SELECT 1 WHERE a = ?", "SELECT 2", "UPDATE x"]);
  assert.equal(t.queries, 3);
  assert.equal(t.db, 15, "5 ms each by the test's clock");
  assert.equal(DB.dump(), "not timed", "anything else passes through");
});

test("a batch hands the binding its own statements and counts each one", async () => {
  const { db } = fakeD1();
  const t = { queries: 0, db: 0 };
  const DB = timedDB(db, t, () => 0);
  const out = await DB.batch([DB.prepare("A").bind(1), DB.prepare("B")]);
  assert.deepEqual(out, [{ results: ["A"] }, { results: ["B"] }]);
  assert.equal(t.queries, 2);
});

test("a failed statement is still counted, and its failure still reaches the caller", async () => {
  const t = { queries: 0, db: 0 };
  const DB = timedDB(
    { prepare: () => ({ first: async () => Promise.reject(new Error("no such table")) }) },
    t,
    () => 0,
  );
  await assert.rejects(DB.prepare("SELECT").first(), /no such table/);
  assert.equal(t.queries, 1);
});

test("the header says the whole request and the database's share", () => {
  assert.equal(
    serverTiming(212.34, { queries: 3, db: 18.06 }),
    'app;dur=212.3, db;dur=18.1;desc="3 queries"',
  );
  assert.equal(serverTiming(9, { queries: 1, db: 2 }), 'app;dur=9, db;dur=2;desc="1 query"');
  assert.equal(SLOW_MS, 500);
});

test("a logged route names no piece of work, team or person, and no key or code", () => {
  assert.equal(routeOf("/v1/me"), "/v1/me");
  assert.equal(routeOf("/v1/work/abcdefgh/status"), "/v1/work/:id/status");
  assert.equal(
    routeOf("/v1/projects/qncqpw8sgdcz/documents/readme"),
    "/v1/projects/:id/documents/:id",
  );
  assert.equal(routeOf("/v1/teams/review-squad/members/ada"), "/v1/teams/:id/members/:id");
  assert.equal(routeOf("/v1/in/k7x2m9qp"), "/v1/in/:id");
  assert.equal(routeOf("/v1/auth/verify/9f8e7d6c5b4a39281706"), "/v1/auth/:id/:id");
  assert.equal(routeOf("/v1/work?scope=review-squad"), "/v1/work", "never the query");
});

test("every API request is timed where the web server hands it to the app", () => {
  const mw = readFileSync(new URL("../../web/server/middleware/1.api.ts", import.meta.url), "utf8");
  assert.match(
    mw,
    /if \(env\.DB && typeof env\.DB === "object"\) env\.DB = timedDB\(env\.DB, timing\);/,
  );
  assert.match(mw, /const res = await api\.fetch\(toWebRequest\(event\), env, cf\?\.context\);/);
  assert.match(mw, /timed\.headers\.append\("server-timing", serverTiming\(total, timing\)\);/);
  assert.match(mw, /if \(total >= SLOW_MS\)/);
});
