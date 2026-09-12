import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { followUpNote } from "../src/passalong.js";

test("a transfer guide says when departing from it is worth a guide of its own", () => {
  const note = followUpNote({ id: "k3mq2xa7" });
  assert.match(note, /publish_guide parent=k3mq2xa7/);
  // The when, not just the how: these are the cases where the original was not the whole story.
  for (const cue of [/Step/, /ASSUMES/, /Gotcha/]) assert.match(note, cue);
  // And the when-not, or a guide that worked collects copies that say nothing new.
  assert.match(note, /worked exactly as written, answer with verify_guide/);
  // A comment, so it cannot be mistaken for part of the guide by anyone who writes it back out.
  assert.match(note, /^<!-- passalong:[\s\S]*-->$/);
});

test("a bug report asks for the fix, not for a departure", () => {
  const note = followUpNote({ id: "bugbug12", kind: "bug" });
  assert.match(note, /once this is fixed/);
  assert.match(note, /parent=bugbug12/);
  assert.doesNotMatch(note, /ASSUMES/);
});

test("no id, no note — there is nothing to name as the parent", () => {
  assert.equal(followUpNote({}), "");
  assert.equal(followUpNote(), "");
});

// Read rather than imported: importing mcp.js starts a server.
test("the local server tells an agent when to write a follow-up, on connect", () => {
  const mcp = readFileSync(new URL("../src/mcp.js", import.meta.url), "utf8");
  assert.match(mcp, /FOLLOW-UP IS A GUIDE, NOT A NOTE/);
  assert.match(mcp, /worked exactly as written, do not/);
  assert.match(mcp, /passalong\.followUpNote\(meta\)/, "and with the guide it is working from");
});
