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
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const API = process.env.PASSALONG_E2E_API;
// What the CLI sends on every call. A test calling the API with Node's own fetch looks exactly like
// a CLI from before the header existed, and the server refuses those once its floor passes 0.11.0.
const VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "web");

/** One account allowed to sync, and the CLI's operations pointed at it. Made once per file. */
let ready;
function setup() {
  ready ??= (async () => {
    assert.match(API, /^http:\/\/localhost[:/]/, "only ever against a local server");
    const { token, account } = await newAccount();
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

/**
 * Upload a screenshot as whoever is signed in, and the markdown that shows it: "it works" is
 * refused without a screenshot of it working. PNG is the 1×1 image declared further down.
 */
async function proof() {
  const api = await import("../src/api.js");
  const shot = await api.uploadShot(PNG, "image/png", "it-works.png");
  return `![it works](${shot.url})`;
}

/** A fresh worktree of this account's own repo, and a ready task for it. */
async function readyTask({ account, p, serialize }, title) {
  const dir = mkdtempSync(join(tmpdir(), "passalong-wt-"));
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "remote", "add", "origin", `git@github.com:e2e/${account}.git`]);
  const task = serialize({
    meta: {
      title,
      summary: "Said to a person for the test.",
      kind: "task",
      target_context: `e2e/${account}`,
    },
    body: "## Goal\nDark mode.\n\n## Acceptance\n- the hub follows the OS setting",
  });
  const id = (await p.share(task, { cwd: dir })).guide.meta.id;
  await p.ready(id);
  return { id, dir };
}

const skip = !API && "PASSALONG_E2E_API not set";

/** What every hand-in carries: the run, not the agent's word for it. */
const PROOF = "npm test -w apps/api → 285 pass, 0 fail";

test("finishing with the write-up publishes it as the task's report", { skip }, async () => {
  const env = await setup();
  const { p, parse } = env;
  const { id, dir } = await readyTask(env, "Report on finish");
  assert.equal((await p.nextTask({ cwd: dir })).id, id);
  const md =
    "---\ntitle: Dark mode, done\nsummary: Said to a person for the test.\n---\n\n## Problem\np\n\n## Steps\n1. tokens\n";
  const done = await p.finishTask(id, {
    markdown: md,
    evidence: PROOF,
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
    (
      await p.share(
        `---\ntitle: what I did\nsummary: Said to a person for the test.\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. x\n`,
        { cwd },
      )
    ).guide.meta.id;

  const task = serialize({
    meta: {
      title: "Add dark mode",
      summary: "Said to a person for the test.",
      kind: "task",
      target_context: `e2e/${account}`,
    },
    body: "## Goal\nDark mode.\n\n## Acceptance\n- the hub follows the OS setting",
  });
  const id = (await p.share(task, { cwd: a })).guide.meta.id;
  await p.ready(id);
  const state = async () => (await p.tasks()).find((t) => t.id === id)?.state;

  // Taken, finished, turned down: back in the queue with the reason on it.
  assert.equal((await p.nextTask({ cwd: a })).id, id);
  await p.finishTask(id, { report: await report(a), evidence: PROOF, cwd: a });
  assert.equal(await state(), "review");
  await p.rejectTask(id, "toggle does nothing on Safari");
  assert.equal(await state(), "ready");

  // Another worktree takes it and reads why; then it is taken back from them.
  const second = await p.nextTask({ cwd: b });
  assert.equal(second.id, id);
  assert.match(second.markdown, /toggle does nothing on Safari/);
  await p.taskProgress(id, "safari fix in progress", { cwd: b });
  await p.release(id);
  assert.equal(await state(), "ready");
  await assert.rejects(p.taskProgress(id, "still going", { cwd: b }), (e) => e.status === 409);

  // The first worktree picks it up with a pointer to what was left, finishes, and it is approved.
  const third = await p.nextTask({ cwd: a });
  assert.match(third.markdown, /safari fix in progress/);
  await p.finishTask(id, { report: await report(a), evidence: PROOF, cwd: a });
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
      summary: "Said to a person for the test.",
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
    markdown:
      "---\ntitle: schema\nsummary: Said to a person for the test.\n---\n\n## Problem\np\n\n## Steps\n1. x\n",
    evidence: PROOF,
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
          meta: {
            title,
            summary: "Said to a person for the test.",
            kind: "task",
            target_context: `e2e/${account}`,
          },
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

test("an account with no email cannot be minted without an unused invite", { skip }, async () => {
  const res = await fetch(`${API}/v1/accounts`, {
    method: "POST",
    headers: { "x-passalong-version": VERSION },
  });
  assert.equal(res.status, 400);
});

/** Another account on the same local server, allowed to sync. Returns its token. */
/**
 * A fresh account. Sign-up is rate-limited per address (ACCOUNT_LIMIT: 5 a minute), and this suite
 * makes more than five, so a 429 waits and tries again rather than handing the tests an undefined
 * token — which the server then reports as "That token isn't recognized", far from the cause.
 */
async function newAccount() {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = `pw-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const headers = { "content-type": "application/json", "x-passalong-version": VERSION };
  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${API}/v1/auth/signup`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 10_000));
      continue;
    }
    if (!res.ok) throw new Error(`could not make an account: ${res.status} ${await res.text()}`);
    const { account } = await res.json();
    const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    const minted = await fetch(`${API}/v1/tokens`, {
      method: "POST",
      headers: { ...headers, cookie },
      body: JSON.stringify({ name: "e2e" }),
    });
    if (!minted.ok) throw new Error(`could not make a token: ${minted.status} ${await minted.text()}`);
    return { account, token: (await minted.json()).token };
  }
  throw new Error("could not make an account: still rate-limited after two minutes");
}

async function secondAccount() {
  const { token, account } = await newAccount();
  await sql(`UPDATE account SET plan = 'solo' WHERE id = '${account}'`);
  return { token, account };
}

/**
 * A statement against the local D1, through wrangler. Resolved when wrangler prints success and its
 * whole process group is gone: `wrangler d1 execute --local` can finish its write and not exit, and
 * waiting for it to exit on its own hung the suite. Killing `npx` alone left wrangler running as its
 * child, and a wrangler that outlived the test could write the database back later — dropping rows
 * the server had written meanwhile, like a token minted a moment before ("That token isn't
 * recognized"). So it runs in its own group, and the group is killed outright once the write is
 * reported: it is committed by then, and nothing after it is wanted. Anything else — a failure, or
 * no answer in 90s — throws.
 */
function sql(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["wrangler", "d1", "execute", "passalong", "--local", "--command", command],
      { cwd: WEB, stdio: ["ignore", "pipe", "pipe"], detached: true },
    );
    let out = "";
    let settled = false;
    let failure = null;
    const stop = (err) => {
      if (settled) return;
      settled = true;
      failure = err || null;
      clearTimeout(timer);
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    };
    const timer = setTimeout(() => stop(new Error(`no answer from wrangler: ${command}`)), 90_000);
    child.stdout.on("data", (b) => {
      out += b;
      if (/"success":\s*true/.test(out)) stop();
    });
    child.stderr.on("data", (b) => {
      out += b;
    });
    // Only once the group is gone does the test carry on.
    child.on("close", (code) => {
      if (!settled) stop(code ? new Error(`wrangler exited ${code}: ${out.slice(-400)}`) : null);
      failure ? reject(failure) : resolve();
    });
  });
}

/**
 * The same, for a question rather than a write: the rows come back.
 *
 * `--json` prints the whole answer as one array, so the read is done the moment that array parses
 * — at which point the process group goes, for the reason sql() explains. A statement that never
 * prints a parsable answer in 90s throws.
 */
function rows(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["wrangler", "d1", "execute", "passalong", "--local", "--json", "--command", command],
      { cwd: WEB, stdio: ["ignore", "pipe", "pipe"], detached: true },
    );
    let out = "";
    let settled = false;
    let answer = null;
    let failure = null;
    const stop = (err) => {
      if (settled) return;
      settled = true;
      failure = err || null;
      clearTimeout(timer);
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    };
    const timer = setTimeout(() => stop(new Error(`no answer from wrangler: ${command}`)), 90_000);
    child.stdout.on("data", (b) => {
      out += b;
      const from = out.indexOf("[");
      if (from < 0) return;
      try {
        answer = JSON.parse(out.slice(from))[0]?.results ?? [];
        stop();
      } catch {
        // Still arriving.
      }
    });
    child.stderr.on("data", (b) => {
      out += b;
    });
    child.on("close", (code) => {
      if (!settled) stop(code ? new Error(`wrangler exited ${code}: ${out.slice(-400)}`) : null);
      if (failure) reject(failure);
      else if (!answer) reject(new Error(`no rows parsed from wrangler: ${out.slice(-400)}`));
      else resolve(answer);
    });
  });
}

/** A 1x1 PNG, as bytes the shots route will accept. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("a task's evidence can arrive against the line it answers", { skip }, async () => {
  const env = await setup();
  const { p } = env;
  const { id, dir } = await readyTask(env, "Evidence per line");
  await p.take(id, { cwd: dir });
  await p.handIn(id, {
    note: "Done, and it holds.",
    markdown:
      "---\ntitle: Per line, done\nsummary: Said to a person for the test.\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. x\n",
    // A real command, run here by the CLI's own runner before the hand-in leaves this process:
    // its exit code decides the check and what it printed is recorded. It used to be a command
    // pasted into `ran`, which is the agent typing a string that looks like a run — indistinguishable
    // in the text from this, and proof of nothing.
    checks: [
      {
        check: "the hub follows the OS setting",
        cmd: "node -e \"console.log('58 pass, 0 fail')\"",
      },
    ],
    cwd: dir,
  });
  const row = (await p.tasks()).find((t) => t.id === id);
  assert.equal(row.state, "review");
  assert.equal(row.claim.checks.length, 1);
  assert.equal(row.claim.checks[0].check, "the hub follows the OS setting");
  assert.equal(row.claim.checks[0].exit, 0, "the runner recorded what it returned");
  assert.match(row.claim.checks[0].ran, /58 pass, 0 fail/, "and kept its output, not an account");
  // The block of text is filled from them, so everything that reads `evidence` still works.
  assert.match(row.claim.evidence, /58 pass, 0 fail/);
});

test("a check with nothing behind it is refused, like any other claim", { skip }, async () => {
  const env = await setup();
  const { p } = env;
  const { id, dir } = await readyTask(env, "Evidence per line, refused");
  await p.take(id, { cwd: dir });
  await assert.rejects(
    p.handIn(id, {
      note: "Done.",
      markdown:
        "---\ntitle: x\nsummary: Said to a person for the test.\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. x\n",
      checks: [{ check: "the hub follows the OS setting", ran: "it works" }],
      cwd: dir,
    }),
    /what you ran and what came back/,
  );
});

test("a check answered in words is refused, however much it says", { skip }, async () => {
  // Long enough to clear the length rule and still nothing that ran or was shown. This is the one
  // the product was letting through: "a Sales Order PDF renders with the store's brand colour",
  // answered with a paragraph about what the agent saw, and nothing in the system had looked.
  const env = await setup();
  const { p } = env;
  const { id, dir } = await readyTask(env, "Described, not shown");
  await p.take(id, { cwd: dir });
  await assert.rejects(
    p.handIn(id, {
      note: "Done.",
      markdown:
        "---\ntitle: x\nsummary: Said to a person for the test.\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. x\n",
      checks: [
        {
          check: "the PDF renders with the store's brand colour",
          ran: "Opened SO-00026 in the viewer and the header bar is #1f6feb, which matches.",
        },
      ],
      cwd: dir,
    }),
    /Run it or show it/,
  );
});

test("a follow-up is never handed over alone: the guide it came out of comes with it", {
  skip,
}, async () => {
  const { p } = await setup();
  const dir = mkdtempSync(join(tmpdir(), "passalong-wt-"));
  const doc = (title) =>
    `---\ntitle: ${title}\nsummary: Said to a person for the test.\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. open/close per day\n`;
  const parent = (await p.share(doc("Store Hours UI"), { cwd: dir })).guide.meta.id;
  const child = (await p.share(doc("Confirmation email"), { cwd: dir, follows: parent })).guide.meta
    .id;

  const lead = await p.parentGuide({ id: child, parent });
  assert.match(lead, new RegExp(`^THIS IS A FOLLOW-UP TO ${parent}: Store Hours UI — open\\.`));
  assert.match(lead, /open\/close per day/, "the parent's own document comes with it");

  // Where the parent has got to, because that is what says whether this can be acted on.
  const agent = { agent: "e2e-parent-aaaa", repo: "e2e/parent" };
  await fetch(`${API}/v1/take`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.PASSALONG_TOKEN}`,
      "x-passalong-version": VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...agent, id: parent }),
  });
  assert.match(await p.parentGuide({ id: child, parent }), /— held/);

  // A guide that follows nothing hands over nothing.
  assert.equal(await p.parentGuide({ id: parent }), "");
});

test("a screenshot handed in as evidence belongs to the guide, so the nightly sweep leaves it", {
  skip,
}, async () => {
  const env = await setup();
  const { p } = env;
  const { id, dir } = await readyTask(env, "Evidence with a picture");

  const { shot } = await (
    await fetch(`${API}/v1/shots`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.PASSALONG_TOKEN}`,
        "x-passalong-version": VERSION,
        "content-type": "image/png",
      },
      body: PNG,
    })
  ).json();
  assert.ok(shot.id, "the screenshot uploaded");
  // Unclaimed on upload: it belongs to nothing until a document points at it.
  assert.deepEqual(await rows(`SELECT guide_id FROM shot WHERE id = '${shot.id}'`), [
    { guide_id: "" },
  ]);

  await p.take(id, { cwd: dir });
  await p.handIn(id, {
    note: "Done, and it holds.",
    markdown:
      "---\ntitle: Picture, done\nsummary: Said to a person for the test.\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. x\n",
    evidence: `$ npm test\n> 3 pass, 0 fail\n\n![the refusal](${shot.url})`,
    cwd: dir,
  });

  // Claimed by the task it answers. Evidence is not markdown and lives on the claim, so nothing
  // used to claim it — and sweepOrphans() deleted it a day later, leaving a broken image where the
  // one part of a hand-in a reviewer cannot reconstruct used to be.
  assert.deepEqual(await rows(`SELECT guide_id FROM shot WHERE id = '${shot.id}'`), [
    { guide_id: id },
  ]);
});

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
      meta: {
        title: body,
        summary: "Said to a person for the test.",
        kind: "task",
        target_context: `e2e/${account}`,
      },
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
    markdown:
      "---\ntitle: team done\nsummary: Said to a person for the test.\n---\n\n## Problem\np\n\n## Steps\n1. x\n",
    evidence: PROOF,
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
      summary: "Said to a person for the test.",
      goal: "A theme table.",
      acceptance: "- migration applies",
      target_context: target,
    },
    {
      title: "Plan: API",
      summary: "Said to a person for the test.",
      goal: "Read the theme.",
      acceptance: "- GET /theme answers",
      target_context: target,
      after: [0],
    },
    {
      title: "Plan: UI",
      summary: "Said to a person for the test.",
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
    p.planTasks([
      {
        title: "x",
        summary: "Said to a person for the test.",
        goal: "g",
        acceptance: "- a",
        after: [0],
      },
    ]),
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
      {
        title: "Work: one",
        summary: "Said to a person for the test.",
        goal: "g",
        acceptance: "- a",
        target_context: repo,
      },
      {
        title: "Work: two",
        summary: "Said to a person for the test.",
        goal: "g",
        acceptance: "- a",
        target_context: repo,
        after: [],
      },
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
    [
      {
        title: "Work: quits",
        summary: "Said to a person for the test.",
        goal: "g",
        acceptance: "- a",
        target_context: repo,
      },
    ],
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
  const task = /take[^.]*hand_in|hand_in[^.]*take/;
  // With a screenshot, so it gets as far as the server: the CLI refuses a "works" without one
  // before asking, and that refusal is not the one this test is about.
  const shotFile = join(mkdtempSync(join(tmpdir(), "passalong-shot-")), "works.png");
  writeFileSync(shotFile, PNG);
  await assert.rejects(
    p.verdict(id, true, "", { images: [shotFile] }),
    (e) => e.status === 400 && task.test(e.message),
  );
  await assert.rejects(api.ack(id, true, ""), (e) => e.status === 400 && task.test(e.message));
});

test("one set of verbs for every kind: take, progress, hand_in, pass, each saying what is next", {
  skip,
}, async () => {
  const { p } = await setup();
  const call = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${process.env.PASSALONG_TOKEN}`,
        "x-passalong-version": VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json()) };
  };
  const h = (
    await p.share(
      "---\ntitle: Stream the PDF\nsummary: Said to a person for the test.\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. x\n",
    )
  ).guide.meta.id;
  const a = { agent: "e2e-agent-aaaa", repo: "e2e/one", host: "mac", worktree: "/w/a" };
  const b = { agent: "e2e-agent-bbbb", repo: "e2e/one" };
  const c = { agent: "e2e-agent-cccc", repo: "e2e/two" };

  const took = await call("POST", "/v1/take", { ...a, id: h });
  assert.equal(took.guide.kind, "transfer");
  assert.match(took.guide.markdown, /Stream the PDF/);
  assert.deepEqual(
    took.next.map((s) => s.tool),
    ["progress", "hand_in", "pass"],
  );

  const clash = await call("POST", "/v1/take", { ...b, id: h });
  assert.equal(clash.status, 409);
  assert.equal(clash.holder.worktree, "/w/a", "the refusal says who has it");
  assert.equal((await call("POST", "/v1/take", { ...c, id: h })).guide.repo, "e2e/two");

  const said = await call("PUT", `/v1/guides/${h}/progress`, { ...a, note: "halfway" });
  assert.equal(said.note, "halfway");
  assert.ok(said.next.length);

  // Your own guide: nobody to hand it in to, and the claim is still yours to pass.
  assert.equal(
    (await call("POST", `/v1/guides/${h}/hand_in`, { ...a, ok: true, note: "Done." })).status,
    403,
  );
  const passed = await call("POST", `/v1/guides/${h}/pass`, { ...a, why: "wrong repo after all" });
  assert.deepEqual(
    passed.next.map((s) => s.tool),
    ["take"],
  );
  const gone = await call("PUT", `/v1/guides/${h}/progress`, { ...a, note: "still going" });
  assert.equal(gone.status, 409);
  assert.match(gone.say, /stop/i, "an agent that lost its claim is told to stop");
  assert.equal((await call("POST", "/v1/take", { ...b, id: h })).guide.agent, b.agent);
});

test("the CLI's verbs: take, progress, hand_in and pass, for a task and a handoff alike", {
  skip,
}, async () => {
  const env = await setup();
  const { p } = env;
  const { dir } = await readyTask(env, "Verbs on a task");

  // No id: the next thing waiting in this repo — oldest first, so maybe a task an earlier test
  // left ready. The document lands where a pull would put it.
  const took = await p.take(undefined, { cwd: dir });
  const id = took.guide.id;
  assert.equal(took.guide.kind, "task");
  assert.match(readFileSync(took.path, "utf8"), new RegExp(took.guide.title));
  assert.deepEqual(
    took.next.map((s) => s.tool),
    ["progress", "hand_in", "pass"],
  );

  assert.equal((await p.progress(id, "halfway", { cwd: dir })).note, "halfway");
  const md =
    "---\ntitle: Verbs, done\nsummary: Said to a person for the test.\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. x\n";
  await assert.rejects(
    p.handIn(id, { markdown: md, cwd: dir }),
    /what you ran and what came back/,
    "a hand-in with no evidence is refused",
  );
  const handed = await p.handIn(id, {
    note: "Done, and it holds.",
    markdown: md,
    evidence: "npm test -w apps/api → 285 pass, 0 fail",
    cwd: dir,
  });
  assert.equal(handed.state, "review");
  assert.deepEqual(
    handed.next.map((s) => s.tool),
    ["take"],
  );

  // A handoff by id: taken, then passed with the reason, and free for the next agent.
  const h = (
    await p.share(
      "---\ntitle: A handoff\nsummary: Said to a person for the test.\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. x\n",
      { cwd: dir },
    )
  ).guide.meta.id;
  assert.equal((await p.take(h, { cwd: dir })).guide.kind, "transfer");
  await assert.rejects(p.pass(h, "", { cwd: dir }), /why/);
  assert.deepEqual(
    (await p.pass(h, "not mine", { cwd: dir })).next.map((s) => s.tool),
    ["take"],
  );
});

test("now says what this worktree holds, for the session-start and stop hooks", {
  skip,
}, async () => {
  const env = await setup();
  const { p } = env;
  const { dir } = await readyTask(env, "Held across a restart");
  const took = await p.take(undefined, { cwd: dir });
  const now = await p.now({ cwd: dir });
  assert.equal(now.held.id, took.guide.id);
  assert.equal(now.held.kind, "task");
  await p.pass(took.guide.id, "testing now", { cwd: dir });
  assert.equal((await p.now({ cwd: dir })).held, null);
});

test("the hook commands: a session is told what it holds, and stopped once before ending", {
  skip,
}, async () => {
  const env = await setup();
  const { p } = env;
  const { dir } = await readyTask(env, "Hooked");
  const took = await p.take(undefined, { cwd: dir });
  const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "passalong");
  const run = (hook, input = "") =>
    execFileSync(process.execPath, [bin, "now", "--hook", hook], {
      cwd: dir,
      input,
      env: process.env,
    }).toString();

  const started = JSON.parse(run("session"));
  assert.equal(started.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(
    started.hookSpecificOutput.additionalContext,
    new RegExp(`You hold ${took.guide.id}`),
  );

  const stop = JSON.parse(run("stop", JSON.stringify({ stop_hook_active: false })));
  assert.equal(stop.decision, "block");
  assert.equal(run("stop", JSON.stringify({ stop_hook_active: true })), "", "never twice");

  await p.pass(took.guide.id, "testing the hooks", { cwd: dir });
  assert.equal(run("stop", "{}"), "", "nothing held: free to stop");

  // A repo that never took anything is not given a .passalong/ folder for being asked.
  const bare = mkdtempSync(join(tmpdir(), "passalong-bare-"));
  execFileSync("git", ["init", "-q", bare]);
  execFileSync(process.execPath, [bin, "now", "--hook", "session"], {
    cwd: bare,
    env: process.env,
  });
  assert.equal(existsSync(join(bare, ".passalong")), false);
});

test("a handoff in the browser: taking it holds it, saying it worked hands it in, and its author closes it", {
  skip,
}, async () => {
  const env = await setup();
  const { p } = env;
  const api = await import("../src/api.js");
  const owner = process.env.PASSALONG_TOKEN;
  const as = (token) => {
    process.env.PASSALONG_TOKEN = token;
  };
  const call = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${process.env.PASSALONG_TOKEN}`,
        "x-passalong-version": VERSION,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, ...(await res.json()) };
  };

  const team = await api.createTeam(`handoffs ${Date.now()}`);
  await sql(`UPDATE team SET plan = 'team', seats = 5 WHERE slug = '${team.slug}'`);
  const { code } = await api.invite(team.slug);
  const mate = await secondAccount();
  as(mate.token);
  await api.join(code);

  as(owner);
  const md =
    "---\ntitle: Stream the invoice PDF\nsummary: Said to a person for the test.\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. x\n";
  const id = (await p.share(md, { to: team.slug })).guide.meta.id;

  // The teammate takes it the way the browser does, and shows in Working now as a person.
  as(mate.token);
  await api.ack(id, true, "");
  as(owner);
  const held = (await call("GET", "/v1/working")).working.find((w) => w.id === id);
  assert.match(held.agent, /^person-/);
  assert.equal(held.state, "claimed");

  // "It worked" from the browser hands it in: out of working, into the author's list.
  as(mate.token);
  await api.verdict(id, true, "streams fine now", await proof());
  as(owner);
  assert.equal(
    (await call("GET", "/v1/working")).working.find((w) => w.id === id),
    undefined,
  );
  const [waiting] = (await call("GET", "/v1/handed_in")).handed_in.filter((h) => h.id === id);
  assert.equal(waiting.note, "streams fine now");

  // Only the author closes it; closing archives it and tells the teammate.
  as(mate.token);
  assert.equal((await call("POST", `/v1/guides/${id}/close`)).status, 404);
  await p.activity();
  as(owner);
  assert.equal((await call("POST", `/v1/guides/${id}/close`)).state, "done");
  assert.deepEqual(
    (await call("GET", "/v1/handed_in")).handed_in.filter((h) => h.id === id),
    [],
  );
  as(mate.token);
  const heard = (await p.activity()).notifications.map((n) => n.text).join("\n");
  assert.match(heard, /accepted your work on "Stream the invoice PDF"/);
  as(owner);
});

test("an agent cannot hand in a handoff it does not hold or send its author a false verdict", {
  skip,
}, async () => {
  const { p } = await setup();
  const api = await import("../src/api.js");
  const owner = process.env.PASSALONG_TOKEN;
  const team = await api.createTeam(`agent hand-in ${Date.now()}`);
  await sql(`UPDATE team SET plan = 'team', seats = 5 WHERE slug = '${team.slug}'`);
  const { code } = await api.invite(team.slug);
  const mate = await secondAccount();
  process.env.PASSALONG_TOKEN = mate.token;
  await api.join(code);
  process.env.PASSALONG_TOKEN = owner;
  const id = (
    await p.share(
      "---\ntitle: Check the invoice PDF\nsummary: Said to a person for the test.\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. x\n",
      { to: team.slug },
    )
  ).guide.meta.id;
  const call = async (path, body) => {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${mate.token}`,
        "x-passalong-version": VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json()) };
  };
  const agent = { agent: "e2e-hand-in-agent", repo: "e2e/hand-in" };
  const answer = (who) =>
    call(`/v1/guides/${id}/hand_in`, {
      ...who,
      ok: true,
      evidence: PROOF,
      note: "Done, it holds.",
    });
  const verdicts = () => rows(`SELECT ok FROM verdict WHERE guide_id = '${id}'`);

  assert.equal((await answer(agent)).status, 409);
  assert.deepEqual(await verdicts(), []);
  assert.deepEqual(
    await rows(`SELECT id FROM notification WHERE guide_id = '${id}' AND kind = 'verified'`),
    [],
    "the author hears no verdict from a refused hand-in",
  );

  assert.equal((await call("/v1/take", { ...agent, id })).status, 200);
  assert.equal((await answer({ ...agent, agent: "e2e-other-agent" })).status, 409);
  assert.deepEqual(await verdicts(), []);

  assert.equal((await answer(agent)).status, 200);
  assert.deepEqual(await verdicts(), [{ ok: 1 }]);
  assert.equal((await answer(agent)).status, 409);
  assert.deepEqual(await verdicts(), [{ ok: 1 }]);
});

test("a CLI below the server's floor is refused with what to run; the rest are served", {
  skip,
}, async () => {
  await setup();
  const me = (headers) =>
    fetch(`${API}/v1/me`, {
      headers: { authorization: `Bearer ${process.env.PASSALONG_TOKEN}`, ...headers },
    });
  const old = await me({ "x-passalong-version": "0.9.0" });
  assert.equal(old.status, 426);
  assert.match((await old.json()).message, /npm i -g passalong@latest/);
  assert.equal((await me({ "x-passalong-version": VERSION })).status, 200);
  // Node's own fetch with no version is every CLI up to 0.11.0, which is below the floor.
  assert.equal((await me({})).status, 426);
});

test("handed in means the actor's turn is over: no new guide under it until the author answers", {
  skip,
}, async () => {
  const env = await setup();
  const { p, newId } = env;
  const api = await import("../src/api.js");
  const owner = process.env.PASSALONG_TOKEN;
  const as = (token) => {
    process.env.PASSALONG_TOKEN = token;
  };
  const call = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${process.env.PASSALONG_TOKEN}`,
        "x-passalong-version": VERSION,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, ...(await res.json()) };
  };
  // A publish answers with the guide, whose own `status` would shadow the HTTP one in `call`.
  const followUp = async (parent, title) => {
    const res = await fetch(`${API}/v1/guides/${newId()}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${process.env.PASSALONG_TOKEN}`,
        "x-passalong-version": VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        markdown: `---\ntitle: ${title}\nsummary: Said to a person for the test.\nkind: transfer\nparent: ${parent}\n---\n\nWhat I found.\n`,
      }),
    });
    return { ...(await res.json()), status: res.status };
  };

  const team = await api.createTeam(`review ${Date.now()}`);
  await sql(`UPDATE team SET plan = 'team', seats = 5 WHERE slug = '${team.slug}'`);
  const { code } = await api.invite(team.slug);
  const mate = await secondAccount();
  as(mate.token);
  await api.join(code);

  as(owner);
  const md =
    "---\ntitle: Stream the receipt PDF\nsummary: Said to a person for the test.\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. x\n";
  const id = (await p.share(md, { to: team.slug })).guide.meta.id;

  // The teammate's agent works it, and may add context while it holds it.
  as(mate.token);
  const a = { agent: "e2e-agent-review", repo: "e2e/review" };
  assert.equal((await call("POST", "/v1/take", { ...a, id })).guide.id, id);
  assert.equal((await followUp(id, "Context while working")).status, 201);
  const handed = await call("POST", `/v1/guides/${id}/hand_in`, {
    ...a,
    ok: true,
    evidence: PROOF,
    note: "Done, it holds.",
    risk: "the receipt route is shared with invoices",
  });
  assert.deepEqual(
    handed.next.map((s) => s.tool),
    ["take"],
  );

  // Handed in: a second guide to carry what it found is refused, and the refusal is the remedy.
  const refused = await followUp(id, "Hand-in evidence: receipt PDF");
  assert.equal(refused.status, 409);
  assert.match(refused.message, /handed .* in/);
  assert.match(refused.message, /writeup/);
  assert.match(refused.message, /stop/);

  // The author is the one reviewing it, and may add to their own guide at any time. They are also
  // told what it could break, beside the evidence.
  as(owner);
  const [waiting] = (await call("GET", "/v1/handed_in")).handed_in.filter((h) => h.id === id);
  assert.equal(waiting.risk, "the receipt route is shared with invoices");
  assert.equal((await followUp(id, "Also check the footer")).status, 201);

  // Once the author has answered, the actor's turn is not over any more — it is simply over.
  assert.equal((await call("POST", `/v1/guides/${id}/close`)).state, "done");
  as(mate.token);
  assert.equal((await followUp(id, "Found later")).status, 201);
  as(owner);
});

test("the status line shows what this worktree holds, from a cache it refreshes itself", {
  skip,
}, async () => {
  const env = await setup();
  const { p } = env;
  const { dir } = await readyTask(env, "Shown in the status line");
  const took = await p.take(undefined, { cwd: dir });
  const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "passalong");
  const input = JSON.stringify({ workspace: { current_dir: dir } });
  // The refresh is what the status line starts in the background; run it in the foreground here.
  execFileSync(process.execPath, [bin, "now", "--statusline-refresh", dir], { env: process.env });
  const line = execFileSync(process.execPath, [bin, "now", "--statusline"], {
    input,
    env: process.env,
  }).toString();
  assert.match(line, new RegExp(`▸ ${took.guide.id}`));
  assert.doesNotMatch(line, /\n/);
  await p.pass(took.guide.id, "testing the status line", { cwd: dir });
});

test("reassigning a task: only the assignee's agents get it, and whoever is left out is told", {
  skip,
}, async () => {
  const env = await setup();
  const { p, serialize, account } = env;
  const api = await import("../src/api.js");
  const owner = process.env.PASSALONG_TOKEN;
  const as = (token) => {
    process.env.PASSALONG_TOKEN = token;
  };
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

  const team = await api.createTeam(`assign ${Date.now()}`);
  await sql(`UPDATE team SET plan = 'team', seats = 5 WHERE slug = '${team.slug}'`);
  const { code } = await api.invite(team.slug);
  const mate = await secondAccount();
  const handle = `mate${Date.now().toString(36)}`;
  as(mate.token);
  await api.join(code);
  await api.updateMe({ handle });

  as(owner);
  const task = serialize({
    meta: {
      title: "Assigned work",
      summary: "Said to a person for the test.",
      kind: "task",
      target_context: `e2e/${account}`,
    },
    body: "## Goal\nx\n\n## Acceptance\n- a",
  });
  const id = (await p.share(task, { to: team.slug })).guide.meta.id;
  await p.ready(id);
  assert.equal((await p.assign(id, `@${handle}`)).to, `@${handle}`);

  // Not the owner's agent any more: the queue skips it, and taking it by id says why.
  const mine = worktree();
  const skipped = await p.take(undefined, { cwd: mine });
  assert.notEqual(skipped.guide?.id, id);
  if (skipped.guide) await p.pass(skipped.guide.id, "not this one", { cwd: mine });
  await assert.rejects(p.take(id, { cwd: mine }), /assigned to someone else/);

  // The assignee's agent gets it.
  as(mate.token);
  const theirs = worktree();
  assert.equal((await p.take(id, { cwd: theirs })).guide.id, id);
  await p.activity();

  // To the whole team: nobody is left out, so the mate keeps it.
  as(owner);
  assert.equal((await p.assign(id, "team")).taken_back, 0);
  // To the owner instead: the mate's agent loses it, and the mate is told.
  const me = `own${Date.now().toString(36)}`;
  await api.updateMe({ handle: me });
  const back = await p.assign(id, `@${me}`);
  assert.equal(back.to, `@${me}`);
  assert.equal(back.taken_back, 1);
  await assert.rejects(p.assign(id, "@nobody-here"), (e) => e.status === 400);
  as(mate.token);
  const heard = (await p.activity()).notifications.map((n) => n.text).join("\n");
  assert.match(heard, /gave "Assigned work" to someone else/);
  as(owner);
});

test("whoever it is assigned to can pass it on, even to a teammate with no @name, and the author hears", {
  skip,
}, async () => {
  const env = await setup();
  const { p, serialize, account } = env;
  const api = await import("../src/api.js");
  const owner = process.env.PASSALONG_TOKEN;
  const as = (token) => {
    process.env.PASSALONG_TOKEN = token;
  };

  const team = await api.createTeam(`delegate ${Date.now()}`);
  await sql(`UPDATE team SET plan = 'team', seats = 5 WHERE slug = '${team.slug}'`);
  const { code } = await api.invite(team.slug);
  const ada = await secondAccount();
  const handle = `ada${Date.now().toString(36)}`;
  as(ada.token);
  await api.join(code);
  await api.updateMe({ handle });
  // A teammate who never chose an @name: addressed by their account id.
  as(owner);
  const { code: code2 } = await api.invite(team.slug);
  const quiet = await secondAccount();
  as(quiet.token);
  await api.join(code2);

  as(owner);
  const task = serialize({
    meta: {
      title: "Delegated work",
      summary: "Said to a person for the test.",
      kind: "task",
      target_context: `e2e/${account}`,
    },
    body: "## Goal\nx\n\n## Acceptance\n- a",
  });
  const id = (await p.share(task, { to: team.slug })).guide.meta.id;
  await p.ready(id);
  await p.assign(id, `@${handle}`);
  await p.activity();

  // Ada, the assignee, passes it on to the teammate with no @name.
  as(ada.token);
  const passed = await p.assign(id, `@${quiet.account}`);
  assert.equal(passed.to, `@${quiet.account}`);

  // The author hears who it went to; a stranger to it still cannot move it.
  as(owner);
  const heard = (await p.activity()).notifications.map((n) => n.text).join("\n");
  assert.match(heard, /gave "Delegated work" to someone else/);
  as(ada.token);
  await assert.rejects(
    p.assign(id, `@${handle}`),
    (e) => e.status === 403,
    "no longer hers to move",
  );
  as(owner);
});

test("a team's guide one teammate said worked stops asking the others, so nobody redoes it", {
  skip,
}, async () => {
  const env = await setup();
  const { p } = env;
  const api = await import("../src/api.js");
  const owner = process.env.PASSALONG_TOKEN;
  const as = (token) => {
    process.env.PASSALONG_TOKEN = token;
  };
  const team = await api.createTeam(`nodouble ${Date.now()}`);
  await sql(`UPDATE team SET plan = 'team', seats = 5 WHERE slug = '${team.slug}'`);
  const joinTeam = async () => {
    as(owner);
    const { code } = await api.invite(team.slug);
    const who = await secondAccount();
    as(who.token);
    await api.join(code);
    return who;
  };
  const ada = await joinTeam();
  const bo = await joinTeam();

  as(owner);
  const md =
    "---\ntitle: Fix the invoice total\nsummary: Said to a person for the test.\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. x\n";
  const id = (await p.share(md, { to: team.slug })).guide.meta.id;

  // Both see it waiting. Ada does it and says it worked — without saying "on it" first.
  as(bo.token);
  assert.ok(
    (await api.inbox()).guides.some((g) => g.id === id),
    "Bo sees it before anyone answers",
  );
  as(ada.token);
  await api.verdict(id, true, "totals match now", await proof());

  // Bo is no longer asked, and Bo's agent is told Ada did it rather than doing it again.
  as(bo.token);
  assert.ok(!(await api.inbox()).guides.some((g) => g.id === id), "not waiting on Bo any more");
  const dir = mkdtempSync(join(tmpdir(), "passalong-wt-"));
  execFileSync("git", ["init", "-q", dir]);
  await assert.rejects(p.take(id, { cwd: dir }), /already said it worked/);
  as(owner);
});

test("taken, then given to someone else: it stops being yours", { skip }, async () => {
  const env = await setup();
  const { p } = env;
  const api = await import("../src/api.js");
  const owner = process.env.PASSALONG_TOKEN;
  const as = (token) => {
    process.env.PASSALONG_TOKEN = token;
  };
  const team = await api.createTeam(`regive ${Date.now()}`);
  await sql(`UPDATE team SET plan = 'team', seats = 5 WHERE slug = '${team.slug}'`);
  const joinTeam = async (handle) => {
    as(owner);
    const { code } = await api.invite(team.slug);
    const who = await secondAccount();
    as(who.token);
    await api.join(code);
    await api.updateMe({ handle });
    return who;
  };
  const stamp = Date.now().toString(36);
  const me = await joinTeam(`me${stamp}`);
  await joinTeam(`bami${stamp}`);

  as(owner);
  const md =
    "---\ntitle: Ship-to address\nsummary: Said to a person for the test.\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. x\n";
  const id = (await p.share(md, { to: `${team.slug}/@me${stamp}` })).guide.meta.id;

  // I take it, then give it to Bami.
  as(me.token);
  await api.ack(id, true, "");
  await p.assign(id, `@bami${stamp}`);

  // My "on it" went with it: the guide no longer says I am taking it.
  const mine = (await api.list("", "all")).guides.find((g) => g.id === id);
  assert.equal(mine.my_ack, null, "my answer was taken back with the work");
  assert.ok(!mine.for_me);
  as(owner);
});

test("an image held as bytes attaches, and answers the check it was taken for", {
  skip,
}, async () => {
  // The door that was missing. attach_screenshot took a path on this machine, so an agent whose
  // browser hands images back inline and never writes a file had no way to show anything — and,
  // refused for describing what it saw, it swapped to grep checks and put the observation in
  // `writeup`: "a grep proves the code changed, not that the screen renders right."
  const env = await setup();
  const { p } = env;
  const { id, dir } = await readyTask(env, "Evidence from bytes");

  const shot = await p.attachBytes(PNG.toString("base64"), { name: "the rendered header" });
  assert.ok(shot.id, "the bytes uploaded");
  assert.match(shot.markdown, /^!\[the rendered header\]\(/);
  assert.match(shot.url, /\/v1\/shots\//);
  // A data: URL is what several browser tools hand back, so it goes in without being stripped first.
  const asUrl = await p.attachBytes(`data:image/png;base64,${PNG.toString("base64")}`, {});
  assert.ok(asUrl.id);

  // And it is what makes a check showable rather than described: the same check refused a
  // paragraph a moment ago.
  await p.take(id, { cwd: dir });
  await p.handIn(id, {
    note: "Done, and it holds.",
    markdown:
      "---\ntitle: Shown, done\nsummary: Said to a person for the test.\nkind: transfer\n---\n\n## Problem\np\n\n## Steps\n1. x\n",
    checks: [{ check: "the header renders in the brand colour", ran: `here it is: ${shot.url}` }],
    cwd: dir,
  });
  const row = (await p.tasks()).find((t) => t.id === id);
  assert.equal(row.state, "review", "a shown check is evidence");
});

test("the server refuses a guide that does not say what it is", { skip }, async () => {
  // The load-bearing half. The CLI parser no longer seeds `transfer`, but a client on any older
  // version still publishes documents with no `kind:` line — and the row used to coerce whatever
  // arrived into transfer. That is how 162 of 200 real guides were stored as transfers while their
  // titles were tasks and bug reports, with publish_guide's own description promising the default
  // was task. Enforcement belongs where every client reaches it, whatever version it is on.
  const env = await setup();
  const body = "\n\n## Problem\np\n\n## Steps\n1. x\n";
  const rid = () => `k${Math.random().toString(36).slice(2, 9)}`;
  const put = (md) =>
    fetch(`${API}/v1/guides/${rid()}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${process.env.PASSALONG_TOKEN}`,
        "x-passalong-version": VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({ markdown: md }),
    });

  const absent = await put(
    `---\ntitle: Never says\nsummary: Said to a person for the test.\n---${body}`,
  );
  assert.equal(absent.status, 400, "an unstated kind is refused");
  assert.match((await absent.json()).message, /say what this is/);

  const wrong = await put(
    `---\ntitle: Says wrongly\nsummary: Said to a person for the test.\nkind: buggy\n---${body}`,
  );
  assert.equal(wrong.status, 400, "and so is a spelling that is not a kind");
  assert.match((await wrong.json()).message, /is not a kind/);

  // And a stated one is stored exactly as stated, not folded into transfer.
  const id = rid();
  const ok = await fetch(`${API}/v1/guides/${id}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${process.env.PASSALONG_TOKEN}`,
      "x-passalong-version": VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      markdown: `---\ntitle: Says so\nsummary: Said to a person for the test.\nkind: task\n---\n\n## Goal\ng\n\n## Acceptance\n- it holds\n`,
    }),
  });
  assert.equal(ok.status, 201);
  assert.deepEqual(await rows(`SELECT kind FROM guide WHERE id = '${id}'`), [{ kind: "task" }]);
  assert.ok(env);
});
