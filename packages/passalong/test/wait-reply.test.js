// `passalong wait <id>`: an agent that asked and stopped hears the hub's reply when it lands.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.PASSALONG_API = "http://fake.test";
process.env.PASSALONG_TOKEN = "t";
process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "pa-home-"));
const { waitForReply } = await import("../src/passalong.js");

const AGENT = "abcdef123456";
const cwd = mkdtempSync(join(tmpdir(), "pa-wait-"));
mkdirSync(join(cwd, ".passalong"));
writeFileSync(join(cwd, ".passalong", "agent.json"), JSON.stringify({ id: AGENT }));

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function serve(rounds) {
  const asked = [];
  let n = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    asked.push(`${init.method || "GET"} ${u.pathname}`);
    if (u.pathname === "/v1/working")
      return json({ working: rounds[Math.min(n++, rounds.length - 1)] });
    if (u.pathname === "/v1/work/w1/progress")
      return json({
        id: "w1",
        replies: [{ id: 9, body: "Use the header", by: { name: "Ada" } }],
        next: [],
      });
    return json({ message: "no" }, 404);
  };
  return asked;
}

const held = (replies) => ({
  id: "w1",
  agent: AGENT,
  by: { you: true },
  replies,
  asking: "Where?",
});

test("waits without renewing, then hands over the reply", async () => {
  const asked = serve([[held(0)], [held(0)], [held(1)]]);
  const r = await waitForReply("w1", { cwd, sleep: async () => {} });
  assert.equal(r.held, true);
  assert.equal(r.replies[0].body, "Use the header");
  // Only one progress call, after the reply was there: renewing earlier would cut the ask's hold.
  assert.deepEqual(
    asked.filter((a) => !a.startsWith("GET")),
    ["PUT /v1/work/w1/progress"],
  );
});

test("stops when the work is no longer this agent's", async () => {
  serve([[held(0)], []]);
  const r = await waitForReply("w1", { cwd, sleep: async () => {} });
  assert.equal(r.held, false);
});

test("waits out a dropped connection", async () => {
  let first = true;
  serve([[held(1)]]);
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (first) {
      first = false;
      throw new TypeError("fetch failed");
    }
    return real(url, init);
  };
  const r = await waitForReply("w1", { cwd, sleep: async () => {} });
  assert.equal(r.replies.length, 1);
});
