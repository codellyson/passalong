import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Isolated before the modules load: the store resolves its home once, and shares go to a fake
// server rather than a live account.
process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-follows-"));
const { fakeServer } = await import("./fake-server.js");
const server = fakeServer();
const { share } = await import("../src/passalong.js");

const DOC = (id = "") =>
  `---\n${id ? `id: ${id}\n` : ""}title: What the migration actually needed\nsummary: How the migration was done, for whoever repeats it.\nkind: transfer\n---\n\n## Problem\nx\n\n## Steps\n1. y\n`;

test("--follows records the parent in the document that gets stored", async () => {
  // A bare id resolves without the network, so this is the whole write path end to end.
  const { guide } = await share(DOC(), { follows: "zx9y8w42" });
  assert.equal(guide.meta.parent, "zx9y8w42");
  assert.match(server.guides.get(guide.meta.id), /^parent: zx9y8w42$/m);
});

test("a guide cannot be published as its own follow-up", async () => {
  await assert.rejects(
    () => share(DOC("k3mq2xa7"), { follows: "k3mq2xa7" }),
    /cannot follow itself/,
  );
});

test("no --follows leaves a guide with no parent at all", async () => {
  const { guide } = await share(DOC());
  assert.equal(guide.meta.parent, undefined);
  assert.doesNotMatch(server.guides.get(guide.meta.id), /^parent:/m);
});
