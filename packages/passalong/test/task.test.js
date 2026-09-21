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
  // Inside a repo, the task is for that repo until its author says otherwise. With no remote, the
  // repo is its folder name.
  assert.equal(g.meta.target_context, dir.split("/").pop().toLowerCase());
  // With one, it is the remote: two worktrees of one repo have two folder names and one remote.
  execFileSync("git", ["-C", dir, "remote", "add", "origin", "git@github.com:Owner/Repo.git"]);
  assert.equal(parse(taskScaffold("x", dir)).meta.target_context, "owner/repo");
});

test("a worktree is one agent, and keeps being the same one", () => {
  const dir = mkdtempSync(join(tmpdir(), "passalong-repo-"));
  execFileSync("git", ["init", "-q", dir]);
  const first = passalong.agent(dir);
  assert.match(first.agent, /^[a-f0-9]{24}$/);
  assert.equal(passalong.agent(dir).agent, first.agent, "a restarted session is the same agent");
  const other = mkdtempSync(join(tmpdir(), "passalong-repo-"));
  execFileSync("git", ["init", "-q", other]);
  assert.notEqual(passalong.agent(other).agent, first.agent, "another worktree is another agent");
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

test("an agent started by work is told to commit what it did, under the task's id", () => {
  const prompt = passalong.workPrompt({
    id: "ab12cd34",
    path: "/x/ab12cd34.md",
    markdown: "## Goal\ng",
  });
  assert.match(prompt, /commit/i);
  assert.match(prompt, /ab12cd34/);
  assert.match(prompt, /pr`?.*commit|commit.*`?pr/i, "and to hand the commit to finish_task");
});

test("an agent that cannot finish is told to say why where the board shows it", () => {
  const prompt = passalong.workPrompt({
    id: "ab12cd34",
    path: "/x/ab12cd34.md",
    markdown: "## Goal\ng",
  });
  assert.match(prompt, /BLOCKED:/);
  assert.match(prompt, /task_progress[^.]*BLOCKED|BLOCKED[^.]*task_progress/);
});
