// A team's board is one board: what the hub shows waiting and what agents are offered are the same
// work. The hub reads `GET /v1/work` and places each card with `boardPlace()` and `lanesOf()`
// (board.ts); agents read `GET /v1/tasks` (`claims.list`) and `GET /v1/working` (`claims.working`),
// which `find_work` with nothing and `passalong board` are built from. This runs both reads against
// a real SQLite with every migration and compares the sets.
//
// 2026-11-10: an agent told its person there was nothing to do while the hub showed team work.
// `claims.list` sorted oldest first and stopped at 200 rows, finished work included. The fixture is
// built so that cut, or any cut like it on either side, drops a piece of waiting work.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { boardPlace, lanesOf, WORK_LIST_MAX, workList } from "../src/board.ts";
import { LIST_MAX, list, working } from "../src/claims.ts";

const T0 = "2026-11-10T09:00:00.000Z";
const at = (minutes) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();
const NOW = at(10_000);

function d1() {
  const sql = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) sql.exec(readFileSync(new URL(f, dir), "utf8"));
  const db = {
    raw: sql,
    prepare(q) {
      const stmt = sql.prepare(q);
      const bound = (args) => ({
        first: async () => stmt.get(...args) ?? null,
        all: async () => ({ results: stmt.all(...args) }),
      });
      return { ...bound([]), bind: (...args) => bound(args) };
    },
  };
  return db;
}

/** Me and Ada in Crew, a #frontend group I am in, and Elsewhere, a team I am not in. */
function fixture() {
  const db = d1();
  const s = db.raw;
  const acct = s.prepare(
    "INSERT INTO account (id, token_hash, created, handle) VALUES (?, ?, ?, ?)",
  );
  for (const id of ["me", "ada", "zed"]) acct.run(id, `h-${id}`, T0, id);
  s.exec(`INSERT INTO team (id, slug, name, created_by, created) VALUES
            ('crew', 'crew', 'Crew', 'me', '${T0}'), ('else', 'elsewhere', 'Elsewhere', 'zed', '${T0}');
          INSERT INTO membership (team_id, account_id, joined) VALUES
            ('crew', 'me', '${T0}'), ('crew', 'ada', '${T0}'), ('else', 'zed', '${T0}');
          INSERT INTO team_group (id, team_id, slug, name, created) VALUES
            ('fe', 'crew', 'frontend', 'Frontend', '${T0}');
          INSERT INTO group_member (group_id, account_id) VALUES ('fe', 'me'), ('fe', 'ada');`);
  const insert = s.prepare(
    `INSERT INTO work (id, account_id, share_key, title, status, source_context, tags, stack,
                       markdown, created, updated, team_id, to_account_id, to_group_id)
     VALUES (?, ?, 'k', ?, ?, '', '[]', '[]', '', ?, ?, ?, ?, ?)`,
  );
  const work = (
    id,
    minute,
    { status = "ready", by = "ada", team = "crew", to = "", group = "" } = {},
  ) => insert.run(id, by, id, status, at(minute), at(minute), team, to, group);

  // Open work older than everything finished: a cut taking the newest rows drops it.
  work("old-anyone", 0);
  // More finished work than either side used to read, all older than what is waiting.
  for (let i = 0; i < 260; i++)
    work(`done-${String(i).padStart(3, "0")}`, 10 + i, { status: "done" });
  // Ready work for each address the board groups by: me by handle, a teammate, a group, nobody.
  work("for-me", 1000, { to: "me" });
  work("for-ada", 1001, { to: "ada" });
  work("for-frontend", 1002, { group: "fe" });
  work("for-anyone", 1003);
  work("mine-for-ada", 1004, { by: "me", to: "ada" });
  // Blocked by unfinished work: still To do on the board, and still offered to agents.
  work("blocked", 1005);
  s.exec("INSERT INTO task_block (work_id, blocker_id) VALUES ('blocked', 'for-anyone')");
  // Held by Ada's agent: In progress on the board, on /v1/working for agents.
  work("held", 1006);
  s.exec(`INSERT INTO claim (work_id, account_id, agent_id, state, claimed_at, lease_until, updated)
          VALUES ('held', 'ada', 'agent-ada', 'claimed', '${at(1006)}', '${at(20_000)}', '${at(1006)}')`);
  // Neither waiting: a draft, and work in a team I am not in.
  work("a-draft", 1007, { status: "draft" });
  work("not-mine", 1008, { by: "zed", team: "else" });
  return db;
}

const WAITING = [
  "old-anyone",
  "for-me",
  "for-ada",
  "for-frontend",
  "for-anyone",
  "mine-for-ada",
  "blocked",
];

/** The hub's board for me: every card with its column and lanes, as `summaries()` places them. */
async function hubBoard(db, scope) {
  const rows = await workList(db, "me", scope);
  const claimRows = db.raw.prepare("SELECT * FROM claim").all();
  const groups = new Map(
    db.raw
      .prepare("SELECT id, slug FROM team_group")
      .all()
      .map((g) => [g.id, { slug: g.slug }]),
  );
  const members = new Map();
  for (const m of db.raw.prepare("SELECT group_id, account_id FROM group_member").all())
    members.set(m.group_id, [...(members.get(m.group_id) || []), m.account_id]);
  return rows.map((r) => {
    const held = claimRows.filter((k) => k.work_id === r.id);
    return {
      id: r.id,
      stage: boardPlace(r, held, "me", NOW).stage,
      lanes: lanesOf(r, held, groups, members),
    };
  });
}

/** What an agent is offered: To do from /v1/tasks (todoLanes' filter) and In progress from /v1/working. */
async function agentBoard(db, scope) {
  const tasks = await list(db, "me", NOW, scope);
  return {
    todo: tasks.filter((r) => r.state === "ready" || r.state === "blocked"),
    working: (await working(db, "me", NOW, scope)).map((w) => w.work.id),
  };
}

const sorted = (ids) => [...ids].sort();

for (const [name, hubScope, agentScope] of [
  ["everything I can see", { kind: "all", teams: ["crew"] }, { kind: "all" }],
  ["one team", { kind: "team", id: "crew" }, { kind: "team", id: "crew" }],
]) {
  test(`the hub's board and the agents' board show the same work: ${name}`, async () => {
    const db = fixture();
    const hub = await hubBoard(db, hubScope);
    const agent = await agentBoard(db, agentScope);

    const hubTodo = hub.filter((c) => c.stage === "todo").map((c) => c.id);
    assert.deepEqual(sorted(hubTodo), sorted(WAITING), "the hub shows every piece waiting");
    assert.deepEqual(
      sorted(agent.todo.map((r) => r.task.id)),
      sorted(hubTodo),
      "agents are offered exactly what the hub shows in To do",
    );
    assert.deepEqual(
      sorted(agent.working),
      sorted(hub.filter((c) => c.stage === "working").map((c) => c.id)),
      "what agents see held is what the hub shows In progress",
    );
    assert.ok(!hub.some((c) => c.id === "not-mine"), "another team's work is on neither");
    assert.ok(!agent.todo.some((r) => r.task.id === "not-mine"));

    // And grouped under the same people: a handle is that person's lane, a group its own, nobody Anyone.
    const handles = new Map(
      db.raw
        .prepare("SELECT id, handle FROM account")
        .all()
        .map((a) => [a.id, a.handle]),
    );
    const hubLanes = new Map(hub.map((c) => [c.id, c.lanes.map((l) => handles.get(l) ?? l)]));
    for (const { task } of agent.todo) {
      const to = task.to_handle
        ? [task.to_handle]
        : task.to_group_slug
          ? [`#${task.to_group_slug}`]
          : [];
      assert.deepEqual(hubLanes.get(task.id), to, `${task.id} sits under the same lane`);
    }
  });
}

test("the hub reads as far as agents do", () => {
  assert.equal(WORK_LIST_MAX, LIST_MAX);
});
