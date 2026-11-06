import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Plain `passalong work`: any ready work for this repo, one after another, stopping at the first
// its agent did not finish. The runner (`--watch`) is runner-worktrees.test.js.
process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-runner-"));
process.env.PASSALONG_API = "http://fake.test";
process.env.PASSALONG_TOKEN = "t";
const passalong = await import("../src/passalong.js");

/** A stand-in queue: hands out `queue` in order, and says each task is still open after its run. */
function fakeQueue(queue) {
  const asked = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const json = (body) =>
      new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    if (u.pathname === "/v1/tasks/next") {
      asked.push(JSON.parse(init.body || "{}"));
      const id = queue.shift();
      return json({ task: id ? { id, title: `task ${id}`, markdown: "" } : null });
    }
    if (u.pathname === "/v1/tasks") return json({ tasks: [] });
    return json({});
  };
  return asked;
}

test("plain work is unchanged: any ready work, and it stops at an unfinished task", async () => {
  const asked = fakeQueue(["cccccccc", "dddddddd"]);
  const run = await passalong.work({ agent: "true" });
  assert.equal(run.stopped, "unfinished");
  assert.equal(run.task, "cccccccc");
  assert.equal(asked.length, 1);
  assert.equal(asked[0].alone, undefined, "a person running work is not limited to safe work");
});
