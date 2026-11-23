// Review notes used to name the machine and folder an agent worked in. scrubWhere takes that out
// of documents written before the rule, and touches nothing else.
import assert from "node:assert/strict";
import { test } from "node:test";
import { scrubWhere } from "../src/claims.ts";

test("old notes lose the machine and keep what happened", () => {
  const before = [
    "Body mentions passed from somewhere: not a note.",
    "",
    "## Review notes",
    "- 2026-11-22 went quiet at Codellyson-3.local:khaime; back in the queue",
    '- 2026-11-22 went quiet at mac:/w/shop; last progress: "halfway"; back in the queue',
    '- 2026-11-21 released from mac:/w/shop; last progress: "schema done"',
    "- 2026-11-21 released from agent a1",
    "- 2026-11-20 passed from mac:/w/shop: needs a design decision: first",
    "- 2026-11-20 passed from laptop: not mine",
    "- 2026-11-19 reassigned to @mark; it was with mac:/w/shop",
    "- 2026-11-18 reopened: the button: still broken",
    "",
  ].join("\n");
  const after = [
    "Body mentions passed from somewhere: not a note.",
    "",
    "## Review notes",
    "- 2026-11-22 went quiet; back in the queue",
    '- 2026-11-22 went quiet; last progress: "halfway"; back in the queue',
    '- 2026-11-21 released; last progress: "schema done"',
    "- 2026-11-21 released",
    "- 2026-11-20 passed: needs a design decision: first",
    "- 2026-11-20 passed: not mine",
    "- 2026-11-19 reassigned to @mark",
    "- 2026-11-18 reopened: the button: still broken",
    "",
  ].join("\n");
  assert.equal(scrubWhere(before), after);
  assert.equal(scrubWhere(after), after);
});
