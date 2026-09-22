// The task queue end to end, through the CLI's own operations against a running server.
//
// Skipped unless PASSALONG_E2E_API names one, so `npm test` stays offline:
//
//   PASSALONG_E2E_API=http://localhost:3001 node --test test/task-flow.e2e.test.js
//
// The account it makes has to be allowed to sync, and a fresh one is not when FREE_SIGNUP is off,
// so it is put on the solo plan in the *local* D1 with `wrangler d1 execute --local`. That only
// works against a local server whose database is apps/web's — never point this at a real one.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const API = process.env.PASSALONG_E2E_API;
const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "web");

/** One account allowed to sync, and the CLI's operations pointed at it. Made once per file. */
let ready;
function setup() {
  ready ??= (async () => {
    assert.match(API, /^http:\/\/localhost[:/]/, "only ever against a local server");
    const { token, account } = await (await fetch(`${API}/v1/accounts`, { method: "POST" })).json();
    await sql(`UPDATE account SET plan = 'solo' WHERE id = '${account}'`);
    process.env.PASSALONG_API = API;
    process.env.PASSALONG_TOKEN = token;
    process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-e2e-"));
    const guide = await import("../src/guide.js");
    const p = await import("../src/passalong.js");
    return { account, p, ...guide };
  })();
  return ready;
}

/** A fresh worktree of this account's own repo, and a ready task for it. */
async function readyTask({ account, p, serialize }, title) {
  const dir = mkdtempSync(join(tmpdir(), "passalong-wt-"));
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "remote", "add", "origin", `git@github.com:e2e/${account}.git`]);
  const task = serialize({
    meta: { title, kind: "task", target_context: `e2e/${account}` },
    body: "## Goal\nDark mode.\n\n## Acceptance\n- the hub follows the OS setting",
  });
  const id = (await p.share(task, { cwd: dir })).guide.meta.id;
  await p.ready(id);
  return { id, dir };
}

const skip = !API && "PASSALONG_E2E_API not set";

test("finishing with the write-up publishes it as the task's report", { skip }, async () => {
  const env = await setup();
  const { p, parse } = env;
  const { id, dir } = await readyTask(env, "Report on finish");
  assert.equal((await p.nextTask({ cwd: dir })).id, id);
  const md = "---\ntitle: Dark mode, done\n---\n\n## Problem\np\n\n## Steps\n1. tokens\n";
  const done = await p.finishTask(id, {
    markdown: md,
    pr: "https://github.com/e2e/x/pull/1",
    cwd: dir,
  });
  const row = (await p.tasks()).find((t) => t.id === id);
  assert.equal(row.state, "review");
  assert.equal(row.claim.report, done.report);
  assert.equal(row.claim.report_title, "Dark mode, done", "the board names what came back");
  // Both links a reviewer follows: the task, and what came back for it.
  assert.match(row.url, new RegExp(`/g/${id}/[a-z0-9]+$`));
  assert.match(row.claim.report_url, new RegExp(`/g/${done.report}/[a-z0-9]+$`));
  const report = parse((await p.pull(done.report, { write: false })).markdown).meta;
  assert.equal(report.title, "Dark mode, done");
  assert.equal(report.parent, id, "the write-up says which task it answers");
});

test("a task goes round: reject, release, approve", { skip }, async () => {
  const env = await setup();
  const { account, p, parse, serialize } = env;
  const worktree = () => {
    const dir = mkdtempSync(join(tmpdir(), "passalong-wt-"));
    execFileSync("git", ["init", "-q", dir]);
    execFileSync("git", [
      "-C",
      dir,
      "remote",
      "add",
      "origin",
      `git@github.com:e2e/${account}.git`,
    ]);
    return dir;
  };
  const [a, b] = [worktree(), worktree()];
  const report = async (cwd) =>
    (await p.share(`---\ntitle: what I did\n---\n\n## Problem\np\n\n## Steps\n1. x\n`, { cwd }))
      .guide.meta.id;

  const task = serialize({
    meta: { title: "Add dark mode", kind: "task", target_context: `e2e/${account}` },
    body: "## Goal\nDark mode.\n\n## Acceptance\n- the hub follows the OS setting",
  });
  const id = (await p.share(task, { cwd: a })).guide.meta.id;
  await p.ready(id);
  const state = async () => (await p.tasks()).find((t) => t.id === id)?.state;

  // Taken, finished, turned down: back in the queue with the reason on it.
  assert.equal((await p.nextTask({ cwd: a })).id, id);
  await p.finishTask(id, { report: await report(a), cwd: a });
  assert.equal(await state(), "review");
  await p.rejectTask(id, "toggle does nothing on Safari");
  assert.equal(await state(), "ready");

  // Another worktree takes it and reads why; then it is taken back from them.
  const second = await p.nextTask({ cwd: b });
  assert.equal(second.id, id);
  assert.match(second.markdown, /toggle does nothing on Safari/);
  await p.taskProgress(id, "safari fix in progress", { cwd: b });
  await p.releaseTask(id);
  assert.equal(await state(), "ready");
  await assert.rejects(p.taskProgress(id, "still going", { cwd: b }), (e) => e.status === 409);

  // The first worktree picks it up with a pointer to what was left, finishes, and it is approved.
  const third = await p.nextTask({ cwd: a });
  assert.match(third.markdown, /safari fix in progress/);
  await p.finishTask(id, { report: await report(a), cwd: a });
  await p.approveTask(id);
  assert.equal(await state(), "done");
  assert.equal(parse((await p.pull(id, { write: false })).markdown).meta.status, "consumed");
});

test("blocked_by in a task's frontmatter holds it until its blocker is approved", {
  skip,
}, async () => {
  const env = await setup();
  const { p, serialize, account } = env;
  const first = await readyTask(env, "Schema first");
  const waits = serialize({
    meta: {
      title: "API on the schema",
      kind: "task",
      target_context: `e2e/${account}`,
      blocked_by: [first.id],
    },
    body: "## Goal\nAPI.\n\n## Acceptance\n- it answers",
  });
  const second = (await p.share(waits, { cwd: first.dir })).guide.meta.id;
  await p.ready(second);
  const state = async (id) => (await p.tasks()).find((t) => t.id === id)?.state;
  assert.equal(await state(second), "blocked");

  assert.equal((await p.nextTask({ cwd: first.dir })).id, first.id);
  await p.finishTask(first.id, {
    markdown: "---\ntitle: schema\n---\n\n## Problem\np\n\n## Steps\n1. x\n",
    cwd: first.dir,
  });
  assert.equal(await state(second), "blocked", "finished is not approved");
  await p.approveTask(first.id);
  assert.equal(await state(second), "ready");
});

test("every draft you wrote can be made ready at once", { skip }, async () => {
  const env = await setup();
  const { p, serialize, account } = env;
  const draft = async (title) =>
    (
      await p.share(
        serialize({
          meta: { title, kind: "task", target_context: `e2e/${account}` },
          body: "## Goal\ng\n\n## Acceptance\n- a",
        }),
      )
    ).guide.meta.id;
  const ids = [await draft("Plan step one"), await draft("Plan step two")];
  const made = await p.readyDrafts();
  for (const id of ids) assert.ok(made.includes(id), `${id} was made ready`);
  const states = (await p.tasks()).filter((t) => ids.includes(t.id)).map((t) => t.state);
  assert.deepEqual(states, ["ready", "ready"]);
  assert.deepEqual(await p.readyDrafts(), [], "nothing left in Draft");
});

/** Another account on the same local server, allowed to sync. Returns its token. */
async function secondAccount() {
  const { token, account } = await (await fetch(`${API}/v1/accounts`, { method: "POST" })).json();
  await sql(`UPDATE account SET plan = 'solo' WHERE id = '${account}'`);
  return { token, account };
}

/**
 * A statement against the local D1, through wrangler. Resolved when wrangler prints success, and
 * the process is then stopped: `wrangler d1 execute --local` can finish its write and not exit, and
 * waiting for the exit hung the whole suite. Anything else — a failure, or no answer in 90s — throws.
 */
function sql(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["wrangler", "d1", "execute", "passalong", "--local", "--command", command],
      { cwd: WEB, stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    const done = (err) => {
      clearTimeout(timer);
      child.kill();
      err ? reject(err) : resolve();
    };
    const timer = setTimeout(() => done(new Error(`no answer from wrangler: ${command}`)), 90_000);
    child.stdout.on("data", (b) => {
      out += b;
      if (/"success":\s*true/.test(out)) done();
    });
    child.stderr.on("data", (b) => {
      out += b;
    });
    child.on("exit", (code) => {
      if (code) done(new Error(`wrangler exited ${code}: ${out.slice(-400)}`));
    });
  });
}

test("in a team, each side hears what the other did to a task — and only the author moves it", {
  skip,
}, async () => {
  const env = await setup();
  const { p, serialize, account } = env;
  const api = await import("../src/api.js");
  const owner = process.env.PASSALONG_TOKEN;
  const as = (token) => {
    process.env.PASSALONG_TOKEN = token;
  };

  const team = await api.createTeam(`tasks ${Date.now()}`);
  await sql(`UPDATE team SET plan = 'team', seats = 5 WHERE slug = '${team.slug}'`);
  const { code } = await api.invite(team.slug);
  const mate = await secondAccount();
  as(mate.token);
  await api.join(code);
  await api.updateMe({ handle: `mate${Date.now().toString(36)}` });

  as(owner);
  const task = (body) =>
    serialize({
      meta: { title: body, kind: "task", target_context: `e2e/${account}` },
      body: `## Goal\n${body}\n\n## Acceptance\n- a`,
    });
  const id = (await p.share(task("Team task"), { to: team.slug })).guide.meta.id;
  await p.ready(id);
  const draft = (await p.share(task("Still a draft"), { to: team.slug })).guide.meta.id;
  await p.activity(); // clears what was unread before this test

  // The teammate can take it, but cannot queue the owner's draft or close the task by status.
  as(mate.token);
  await assert.rejects(p.ready(draft), (e) => e.status === 403);
  await assert.rejects(api.setStatus(id, "consumed"), (e) => e.status === 403);
  const dir = mkdtempSync(join(tmpdir(), "passalong-wt-"));
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "remote", "add", "origin", `git@github.com:e2e/${account}.git`]);
  assert.equal((await p.nextTask({ cwd: dir })).id, id);
  await p.finishTask(id, {
    markdown: "---\ntitle: team done\n---\n\n## Problem\np\n\n## Steps\n1. x\n",
    cwd: dir,
  });

  as(owner);
  const heard = (await p.activity()).notifications.map((n) => n.text).join("\n");
  assert.match(heard, /agent took the task "Team task"/);
  assert.match(heard, /agent finished "Team task", and it is waiting for your review/);
  await p.rejectTask(id, "needs a test");

  as(mate.token);
  const told = (await p.activity()).notifications.map((n) => n.text).join("\n");
  assert.match(told, /sent "Team task" back: needs a test/);
  as(owner);
});

test("a plan becomes draft tasks, each waiting on the steps it names", { skip }, async () => {
  const env = await setup();
  const { p, account } = env;
  const target = `e2e/${account}`;
  const ids = await p.planTasks([
    {
      title: "Plan: schema",
      goal: "A theme table.",
      acceptance: "- migration applies",
      target_context: target,
    },
    {
      title: "Plan: API",
      goal: "Read the theme.",
      acceptance: "- GET /theme answers",
      target_context: target,
      after: [0],
    },
    {
      title: "Plan: UI",
      goal: "Use it.",
      acceptance: "- the hub switches",
      target_context: target,
      after: [0, 1],
    },
  ]);
  assert.equal(ids.length, 3);
  const byId = async () => new Map((await p.tasks()).map((t) => [t.id, t.state]));
  let states = await byId();
  assert.deepEqual(
    ids.map((id) => states.get(id)),
    ["draft", "draft", "draft"],
    "a plan is read before it runs",
  );

  await p.readyDrafts();
  states = await byId();
  assert.deepEqual(
    ids.map((id) => states.get(id)),
    ["ready", "blocked", "blocked"],
  );

  await assert.rejects(
    p.planTasks([{ title: "x", goal: "g", acceptance: "- a", after: [0] }]),
    /earlier step/,
    "a step can only wait on one before it, so a plan cannot loop",
  );
});

test("work takes tasks one after another until the queue is empty", { skip }, async () => {
  const env = await setup();
  const { p, account } = env;
  const repo = `e2e/${account}-work`;
  const dir = mkdtempSync(join(tmpdir(), "passalong-wt-"));
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "remote", "add", "origin", `git@github.com:${repo}.git`]);
  const ids = await p.planTasks(
    [
      { title: "Work: one", goal: "g", acceptance: "- a", target_context: repo },
      { title: "Work: two", goal: "g", acceptance: "- a", target_context: repo, after: [] },
    ],
    { cwd: dir },
  );
  for (const id of ids) await p.ready(id);
  const agent = `node ${join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "fake-agent.mjs")}`;

  const run = await p.work({ cwd: dir, agent });
  assert.deepEqual(run.finished, ids);
  assert.equal(run.stopped, "empty");
  const states = new Map((await p.tasks()).map((t) => [t.id, t.state]));
  assert.deepEqual(
    ids.map((id) => states.get(id)),
    ["review", "review"],
  );
});

test("work stops when an agent exits without finishing, instead of looping on it", {
  skip,
}, async () => {
  const env = await setup();
  const { p, account } = env;
  const repo = `e2e/${account}-quit`;
  const dir = mkdtempSync(join(tmpdir(), "passalong-wt-"));
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "remote", "add", "origin", `git@github.com:${repo}.git`]);
  const [id] = await p.planTasks(
    [{ title: "Work: quits", goal: "g", acceptance: "- a", target_context: repo }],
    { cwd: dir },
  );
  await p.ready(id);
  const agent = `node ${join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "fake-agent.mjs")}`;
  process.env.FAKE_AGENT_GIVES_UP = "1";
  try {
    const run = await p.work({ cwd: dir, agent });
    assert.deepEqual(run.finished, []);
    assert.equal(run.stopped, "unfinished");
    assert.equal(run.task, id);
  } finally {
    delete process.env.FAKE_AGENT_GIVES_UP;
  }
  assert.equal(
    (await p.tasks()).find((t) => t.id === id).state,
    "claimed",
    "still this worktree's",
  );
});

test("a task is answered with the task tools, and the guide ones say so", { skip }, async () => {
  const env = await setup();
  const { p } = env;
  const api = await import("../src/api.js");
  const { id } = await readyTask(env, "Answered the wrong way");
  // A verdict or an ack on a task would be an answer nobody reads: its author reviews it from the
  // queue. Both are refused, and the refusal names the tools that do the job.
  const task = /next_task|task_progress|finish_task/;
  await assert.rejects(p.verdict(id, true, ""), (e) => e.status === 400 && task.test(e.message));
  await assert.rejects(api.ack(id, true, ""), (e) => e.status === 400 && task.test(e.message));
});

test("one set of verbs for every kind: take, progress, hand_in, pass, each saying what is next", { skip }, async () => {
  const { p } = await setup();
  const call = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${process.env.PASSALONG_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json()) };
  };
  const h = (await p.share("---\ntitle: Stream the PDF\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. x\n"))
    .guide.meta.id;
  const a = { agent: "e2e-agent-aaaa", repo: "e2e/one", host: "mac", worktree: "/w/a" };
  const b = { agent: "e2e-agent-bbbb", repo: "e2e/one" };
  const c = { agent: "e2e-agent-cccc", repo: "e2e/two" };

  const took = await call("POST", "/v1/take", { ...a, id: h });
  assert.equal(took.guide.kind, "transfer");
  assert.match(took.guide.markdown, /Stream the PDF/);
  assert.deepEqual(took.next.map((s) => s.tool), ["progress", "hand_in", "pass"]);

  const clash = await call("POST", "/v1/take", { ...b, id: h });
  assert.equal(clash.status, 409);
  assert.equal(clash.holder.worktree, "/w/a", "the refusal says who has it");
  assert.equal((await call("POST", "/v1/take", { ...c, id: h })).guide.repo, "e2e/two");

  const said = await call("PUT", `/v1/guides/${h}/progress`, { ...a, note: "halfway" });
  assert.equal(said.note, "halfway");
  assert.ok(said.next.length);

  // Your own guide: nobody to hand it in to, and the claim is still yours to pass.
  assert.equal((await call("POST", `/v1/guides/${h}/hand_in`, { ...a, ok: true })).status, 403);
  const passed = await call("POST", `/v1/guides/${h}/pass`, { ...a, why: "wrong repo after all" });
  assert.deepEqual(passed.next.map((s) => s.tool), ["take"]);
  const gone = await call("PUT", `/v1/guides/${h}/progress`, { ...a, note: "still going" });
  assert.equal(gone.status, 409);
  assert.match(gone.say, /stop/i, "an agent that lost its claim is told to stop");
  assert.equal((await call("POST", "/v1/take", { ...b, id: h })).guide.agent, b.agent);
});
