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
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const API = process.env.PASSALONG_E2E_API;
const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "web");

test("a task goes round: reject, release, approve", {
  skip: !API && "PASSALONG_E2E_API not set",
}, async () => {
  assert.match(API, /^http:\/\/localhost[:/]/, "only ever against a local server");
  const { token, account } = await (await fetch(`${API}/v1/accounts`, { method: "POST" })).json();
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "passalong",
      "--local",
      "--command",
      `UPDATE account SET plan = 'solo' WHERE id = '${account}'`,
    ],
    { cwd: WEB, stdio: "ignore" },
  );
  process.env.PASSALONG_API = API;
  process.env.PASSALONG_TOKEN = token;
  process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-e2e-"));
  const { parse, serialize } = await import("../src/guide.js");
  const p = await import("../src/passalong.js");

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
