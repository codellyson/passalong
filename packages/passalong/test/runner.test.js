import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// The runner (`passalong work --watch`, docs/LOOP.md §1a): asks only for work a person marked safe
// to run alone, waits when there is none, and keeps going past a task its agent did not finish.
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

test("the runner asks only for safe work, waits for more, and keeps going past an unfinished task", async () => {
  const asked = fakeQueue(["aaaaaaaa", "bbbbbbbb"]);
  const ran = [];
  const unfinished = [];
  let idles = 0;
  const stop = new Error("stop");
  await assert.rejects(
    passalong.work({
      // An agent that does nothing: the task stays open, as when an agent gives up.
      agent: "true",
      watch: true,
      every: 30,
      onTask: (t) => ran.push(t.id),
      onUnfinished: (t) => unfinished.push(t.id),
      onIdle: () => idles++,
      sleep: async (ms) => {
        assert.equal(ms, 30_000, "it waits the time it was given between looks");
        if (idles >= 2) throw stop;
      },
    }),
    stop,
  );
  assert.deepEqual(ran, ["aaaaaaaa", "bbbbbbbb"], "an unfinished task does not stop the runner");
  assert.deepEqual(unfinished, ["aaaaaaaa", "bbbbbbbb"]);
  assert.ok(idles >= 2, "with nothing left it waits and looks again");
  assert.ok(
    asked.every((b) => b.alone === true),
    "every ask is for work marked safe to run alone",
  );
});

test("plain work is unchanged: any ready work, and it stops at an unfinished task", async () => {
  const asked = fakeQueue(["cccccccc", "dddddddd"]);
  const run = await passalong.work({ agent: "true" });
  assert.equal(run.stopped, "unfinished");
  assert.equal(run.task, "cccccccc");
  assert.equal(asked.length, 1);
  assert.equal(asked[0].alone, undefined, "a person running work is not limited to safe work");
});
