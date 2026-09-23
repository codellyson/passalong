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

test("a call that has to carry something says so on the same line it is named", () => {
  const note = nextNote(
    {
      next: [
        { tool: "hand_in", when: "it is done", why: "its author reviews it", with: "evidence: …" },
      ],
    },
    "k3mq2xa7",
  );
  assert.match(
    note,
    /hand_in k3mq2xa7 — when it is done \(its author reviews it\)\n {6}with evidence/,
  );
});

test("an answer to stop says so first, and nothing to say adds nothing", () => {
  assert.match(nextNote({ next: [], say: "Stop." }), /next:\n {2}Stop\./);
  assert.equal(nextNote({}), "");
});

// A session that fixed something on a branch the team can already see has crossed no boundary, and
// "update the passalong" is not a request to publish one. Both are the same costly misread: a guide
// nobody asked for, for work nobody has to repeat. The instructions have to say so before the tool
// descriptions are read, so this pins them.
test("the server tells an agent to check what it holds before publishing, and to ask when the ask is vague", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/mcp.js", import.meta.url), "utf8");
  const instructions = src.slice(src.indexOf("instructions:"), src.indexOf("registerTool("));
  assert.match(instructions, /BEFORE PUBLISHING ANYTHING/);
  assert.match(instructions, /never publish a second guide about it/);
  assert.match(instructions, /crossed no boundary/);
  assert.match(instructions, /Ask which/);
});
