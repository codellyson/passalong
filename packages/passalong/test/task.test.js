import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// The store reads PASSALONG_HOME when it is first imported, so the modules that use it are
// imported only after it points somewhere this test owns — never at the real ~/.passalong.
process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-task-"));
const { parse, serialize, template } = await import("../src/guide.js");
const { taskScaffold } = await import("../src/capture.js");
const passalong = await import("../src/passalong.js");

function task(extra = {}) {
  const g = parse(template({ kind: "task", title: "Add dark mode" }));
  const body = "## Goal\nDark mode in the hub.\n\n## Acceptance\n- the hub follows the OS setting";
  return serialize({ meta: { ...g.meta, ...extra }, body });
}

test("a task sentence becomes the title and the Goal", () => {
  const dir = mkdtempSync(join(tmpdir(), "passalong-repo-"));
  execFileSync("git", ["init", "-q", dir]);
  const g = parse(taskScaffold("Add dark mode", dir));
  assert.equal(g.meta.kind, "task");
  assert.equal(g.meta.title, "Add dark mode");
  assert.match(g.body, /^## Goal\nAdd dark mode\n/m);
  // Inside a repo, the task is for that repo until its author says otherwise.
  assert.equal(g.meta.target_context, dir.split("/").pop());
});

test("a task outside any repo is for no repo", () => {
  const g = parse(taskScaffold("Write the launch post", mkdtempSync(join(tmpdir(), "passalong-"))));
  assert.equal(g.meta.target_context, "");
});

test("sharing a task leaves it in Draft, and ready moves it on", async () => {
  const { guide } = await passalong.share(task());
  assert.equal(guide.meta.status, "draft");
  const next = await passalong.ready(guide.meta.id);
  assert.equal(next.meta.status, "published");
  await assert.rejects(passalong.ready(guide.meta.id), /not in Draft/);
});

test("ready refuses anything that is not a task", async () => {
  const { guide } = await passalong.share(
    serialize({ meta: { title: "t" }, body: "## Problem\np\n\n## Steps\n1. x" }),
  );
  assert.equal(guide.meta.status, "published");
  await assert.rejects(passalong.ready(guide.meta.id), /not a task/);
});
