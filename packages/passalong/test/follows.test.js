import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Isolated before the modules load: the store resolves its home once, and a real token would turn
// these offline shares into writes against a live account.
process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-follows-"));
delete process.env.PASSALONG_TOKEN;
const { share } = await import("../src/passalong.js");

const DOC = (id = "") =>
  `---\n${id ? `id: ${id}\n` : ""}title: What the migration actually needed\n---\n\n## Problem\nx\n\n## Steps\n1. y\n`;

test("--follows records the parent in the document that gets stored", async () => {
  // A bare id resolves without the network, so this is the whole write path end to end.
  const { guide, path } = await share(DOC(), { follows: "zx9y8w42" });
  assert.equal(guide.meta.parent, "zx9y8w42");
  assert.match(readFileSync(path, "utf8"), /^parent: zx9y8w42$/m);
});

test("a guide cannot be published as its own follow-up", async () => {
  await assert.rejects(
    () => share(DOC("k3mq2xa7"), { follows: "k3mq2xa7" }),
    /cannot follow itself/,
  );
});

test("no --follows leaves a guide with no parent at all", async () => {
  const { guide, path } = await share(DOC());
  assert.equal(guide.meta.parent, undefined);
  assert.doesNotMatch(readFileSync(path, "utf8"), /^parent:/m);
});
