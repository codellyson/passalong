import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { resolveId } from "../src/passalong.js";

// An ack and a verdict need an id and nothing else. Asking the server for the guide to learn an id
// it was already given records a pull, and a reader answering a handoff has not taken delivery of
// it — so the reference has to resolve without a fetch.
test("an id resolves to itself with no network", async () => {
  assert.equal(await resolveId("a1b2c3"), "a1b2c3");
});

test("a local .md file resolves through its own frontmatter", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "passalong-")), "guide.md");
  writeFileSync(path, "---\nid: zx9y8w\ntitle: A guide\n---\n\n# A guide\n");
  assert.equal(await resolveId(path), "zx9y8w");
});

test("anything that is neither an id, a link, nor a file is refused before the write", async () => {
  await assert.rejects(() => resolveId("Not An Id"), /not a passalong id, share link, or .md file/);
  // A path that looks right but is not there: the point is that it fails here rather than sending
  // a write somewhere with a reference nobody can read.
  await assert.rejects(() => resolveId("/nope/missing.md"), /not a passalong id/);
});
