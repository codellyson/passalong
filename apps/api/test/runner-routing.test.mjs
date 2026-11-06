// The runner made usable (2026-11-06): work marked safe to run alone reaches a runner when the repo
// it runs in is that runner's, whichever way it says so: chosen by a person when they ticked it, the
// repo of its project, or a target naming a repo, by its full name or just its last part. Prose in a
// target ("techchak-backend (legacy express)") names no repo, and that work waits for a person.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { next, runsIn, serves } from "../src/claims.ts";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(here, "..", "migrations");
const index = readFileSync(join(here, "../src/index.ts"), "utf8");
const T0 = "2026-11-06T10:00:00.000Z";

function d1() {
  const sql = new DatabaseSync(":memory:");
  for (const f of readdirSync(MIGRATIONS).sort())
    sql.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  return {
    raw: sql,
    // Numbered parameters (?1, used twice) are spelled out as plain ones: D1 and Node 22 take them,
    // but newer Node's SQLite counts each use as another parameter and refuses the query.
    prepare(q) {
      const order = [];
      const stmt = sql.prepare(
        q.replace(/\?(\d+)/g, (_m, n) => {
          order.push(Number(n));
          return "?";
        }),
      );
      const spell = (args) => (order.length ? order.map((n) => args[n - 1]) : args);
      const bound = (raw) => {
        const args = spell(raw);
        return {
          first: async () => stmt.get(...args) ?? null,
          all: async () => ({ results: stmt.all(...args) }),
          run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
        };
      };
      return { ...bound([]), bind: (...args) => bound(args) };
    },
  };
}

function seed(db) {
  db.raw.prepare("INSERT INTO account (id, token_hash, created) VALUES ('me', 'h', ?)").run(T0);
  return (id, { target = "", alone = 1, alone_repo = "", created = T0 } = {}) =>
    db.raw
      .prepare(
        `INSERT INTO work (id, account_id, share_key, title, status, source_context, tags, stack,
                           markdown, created, updated, target, alone, alone_repo)
         VALUES (?, 'me', 'k', ?, 'ready', '', '[]', '[]', '', ?, ?, ?, ?, ?)`,
      )
      .run(id, `work ${id}`, created, created, target, alone, alone_repo);
}

const runnerIn = (repo) => ({
  account: "me",
  agent: `a-${repo}`,
  host: "box",
  repo,
  worktree: "/w",
});

test("where alone work runs: the person's pick, then its project, then a target that names a repo", () => {
  assert.equal(runsIn({ alone_repo: "o/app", target: "o/api", projectRepos: ["o/web"] }), "o/app");
  assert.equal(
    runsIn({ target: "o/api", projectRepos: ["https://github.com/O/Web.git"] }),
    "o/web",
  );
  assert.equal(runsIn({ target: "khaime-mobile" }), "khaime-mobile");
  assert.equal(runsIn({ target: "techchak-backend (legacy express), src/x" }), "");
  assert.equal(runsIn({ target: "a, b, c" }), "", "a list of repos names none of them");
  assert.equal(runsIn({}), "");
  assert.ok(serves("techchak-frontend-apps/khaime-mobile", "khaime-mobile"), "by its last part");
  assert.ok(
    serves("khaime-mobile", "techchak-frontend-apps/khaime-mobile"),
    "a checkout with no remote",
  );
  assert.ok(!serves("o/khaime-mobile-old", "khaime-mobile"));
  assert.ok(!serves("o/app", ""));
});

test("a runner takes only alone work that runs in its repo", async () => {
  const db = d1();
  const work = seed(db);
  work("named", { target: "khaime-mobile" });
  work("picked", {
    alone_repo: "techchak-frontend-apps/khaime-mobile",
    created: "2026-11-06T10:01:00.000Z",
  });
  work("prose", { target: "khaime-mobile (the app)" });
  work("elsewhere", { target: "o/api" });
  work("unticked", { target: "khaime-mobile", alone: 0 });
  const runner = runnerIn("techchak-frontend-apps/khaime-mobile");
  const took = [];
  for (let i = 0; i < 4; i++) {
    const got = await next(db, { ...runner, agent: `a${i}` }, { at: T0, alone: true });
    if (got) took.push(got.task.id);
  }
  assert.deepEqual(took, ["named", "picked"]);
});

test("work in a project runs in the project's repo", async () => {
  const db = d1();
  const work = seed(db);
  work("filed");
  db.raw
    .prepare(
      "INSERT INTO project (id, title, created_by, created, updated, repo) VALUES ('p1', 'App', 'me', ?, ?, 'git@github.com:o/app.git')",
    )
    .run(T0, T0);
  db.raw
    .prepare(
      "INSERT INTO project_work (project_id, work_id, added_by, added) VALUES ('p1', 'filed', 'me', ?)",
    )
    .run(T0);
  assert.equal(await next(db, runnerIn("o/other"), { at: T0, alone: true }), null);
  assert.equal((await next(db, runnerIn("o/app"), { at: T0, alone: true }))?.task.id, "filed");
});

test("ticking it can say the repo, and runners say every repo they serve and what each agent did last", () => {
  const alone = index.slice(index.indexOf('app.put("/v1/work/:id/alone"'));
  assert.match(alone.slice(0, 1500), /alone_repo = \?/);
  assert.match(index, /runs_in: r\.alone\s*\?\s*claims\.runsIn/);
  assert.match(index, /runner_repos: await runnerRepos\(c\)/);
  assert.match(
    index,
    /INSERT INTO runner \(account_id, host, repo, running, runs_today, per_day, at_once, stopped, started, seen, repos\)/,
  );
  assert.match(index, /SELECT text, at FROM work_step WHERE work_id = \? ORDER BY id DESC LIMIT 1/);
});

test("only whoever holds the work reports its steps, and anyone who can read it may watch", () => {
  const post = index.slice(index.indexOf('app.post("/v1/work/:id/steps"'));
  assert.match(post.slice(0, 800), /held\.account_id !== c\.get\("account"\)/);
  const get = index.slice(index.indexOf('app.get("/v1/work/:id/steps"'));
  assert.match(get.slice(0, 300), /readableWork\(c, c\.req\.param\("id"\)\)/);
});
