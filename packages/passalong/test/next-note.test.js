import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-next-"));
const { nextNote } = await import("../src/mcp.js");

test("the server's next move is the last thing an agent reads, with the id filled in", () => {
  const note = nextNote(
    {
      next: [
        { tool: "progress", when: "at each milestone", why: "30 minutes stalls it" },
        { tool: "take", when: "now, with no id", why: "the next thing" },
      ],
    },
    "k3mq2xa7",
  );
  assert.match(note, /^<!-- passalong: next:/);
  assert.match(note, /progress k3mq2xa7 — when at each milestone \(30 minutes stalls it\)/);
  assert.match(note, /\n {2}take — when now/, "take is called with no id");
});

test("an answer to stop says so first, and nothing to say adds nothing", () => {
  assert.match(nextNote({ next: [], say: "Stop." }), /next:\n {2}Stop\./);
  assert.equal(nextNote({}), "");
});
