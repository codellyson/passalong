import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// The store reads PASSALONG_HOME when it is first imported, so the modules that use it are
// imported only after it points somewhere this test owns — never at the real ~/.passalong.
process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-work-"));
const { fakeServer } = await import("./fake-server.js");
const server = fakeServer();
const { parse, serialize } = await import("../src/work.js");
const { workScaffold } = await import("../src/capture.js");
const passalong = await import("../src/passalong.js");

const WORK = (extra = {}) =>
  serialize({
    meta: { title: "Add dark mode", summary: "Add a dark mode to the hub.", ...extra },
    body: "The hub follows the OS setting.",
  });

test("a sentence becomes the title, the summary and the text, with no headings", () => {
  const dir = mkdtempSync(join(tmpdir(), "passalong-repo-"));
  execFileSync("git", ["init", "-q", dir]);
  const g = parse(workScaffold("Add dark mode", dir));
  assert.equal(g.meta.title, "Add dark mode");
  assert.equal(g.meta.summary, "Add dark mode");
  assert.equal(g.meta.kind, undefined, "work has no kind");
  assert.equal(g.body.trim(), "Add dark mode");
  // Inside a repo, it is for that repo until its author says otherwise. With no remote, the repo is
  // its project name; with one, the remote — two worktrees of one repo have two project names.
  assert.equal(g.meta.target_context, dir.split("/").pop().toLowerCase());
  execFileSync("git", ["-C", dir, "remote", "add", "origin", "git@github.com:Owner/Repo.git"]);
  assert.equal(parse(workScaffold("x", dir)).meta.target_context, "owner/repo");
  const none = parse(workScaffold("Write the launch post", mkdtempSync(join(tmpdir(), "p-"))));
  assert.equal(none.meta.target_context, "", "outside any repo it is for no repo");
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

test("work is sent Ready unless it says draft, and ready moves a draft on", async () => {
  assert.equal((await passalong.publish(WORK())).work.meta.status, "ready");
  const { work } = await passalong.publish(WORK({ status: "draft" }));
  assert.equal(work.meta.status, "draft");
  assert.equal(await passalong.ready(work.meta.id), work.meta.id);
  assert.match(server.work.get(work.meta.id), /^status: ready$/m);
  await assert.rejects(passalong.ready(work.meta.id), /not in Draft/);
});

test("a parent is recorded in the document, and work cannot come out of itself", async () => {
  const { work } = await passalong.publish(WORK(), { parent: "zx9y8w42" });
  assert.match(server.work.get(work.meta.id), /^parent: zx9y8w42$/m);
  await assert.rejects(
    passalong.publish(WORK({ id: "k3mq2xa7" }), { parent: "k3mq2xa7" }),
    /cannot come out of itself/,
  );
  const plain = await passalong.publish(WORK());
  assert.doesNotMatch(server.work.get(plain.work.meta.id), /^parent:/m);
});

test("several pieces of work at once wait on earlier ones by position, and draft holds them all", async () => {
  const made = await passalong.createWork(
    [
      { title: "Schema", summary: "Add the table.", repo: "" },
      { title: "API", summary: "Serve it.", after: [0], tags: ["Feature"] },
      { title: "Page", summary: "Show it.", after: [0, 1], body: "On the hub." },
    ],
    { draft: true },
  );
  assert.equal(made.length, 3);
  const [schema, api, page] = made.map((m) => parse(server.work.get(m.id)));
  assert.equal(schema.meta.status, "draft");
  assert.equal(schema.meta.blocked_by, undefined);
  assert.deepEqual(api.meta.blocked_by, [made[0].id]);
  assert.deepEqual(api.meta.tags, ["feature"], "tags are normalised at the boundary");
  assert.deepEqual(page.meta.blocked_by, [made[0].id, made[1].id]);
  assert.equal(page.body.trim(), "On the hub.");
  await assert.rejects(
    passalong.createWork([{ title: "x", summary: "x", after: [0] }]),
    /can only wait on an earlier one/,
  );
});

test("text is replaced by id, and a document naming another id is refused", async () => {
  const { work } = await passalong.publish(WORK());
  const id = work.meta.id;
  await passalong.updateText(id, WORK({ title: "Dark mode, everywhere" }));
  assert.equal(parse(server.work.get(id)).meta.title, "Dark mode, everywhere");
  await assert.rejects(passalong.updateText(id, WORK({ id: "zzzz9999" })), /says it is zzzz9999/);
});

test("an agent started by work is told to commit what it did, under the work's id", () => {
  const prompt = passalong.workPrompt({ id: "ab12cd34", markdown: "Fix the upload button." });
  assert.match(prompt, /commit/i);
  assert.match(prompt, /ab12cd34/);
  assert.match(prompt, /hand_in with id ab12cd34, `pr` set to that commit's hash/);
  assert.match(prompt, /save_document/, "and to put what it learned in the project's documents");
  assert.doesNotMatch(prompt, /transfer|Acceptance|Goal/, "nothing about kinds or sections");
});

test("an agent that cannot finish is told to say why where the board shows it", () => {
  const prompt = passalong.workPrompt({ id: "ab12cd34", markdown: "x" });
  assert.match(prompt, /BLOCKED:/);
  assert.match(prompt, /progress[^.]*BLOCKED|BLOCKED[^.]*progress/);
});
