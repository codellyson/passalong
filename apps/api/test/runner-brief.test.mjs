// What the runner tells its agent comes from the server with each piece of work (2026-11-06): it
// lived in the CLI, so every change to a sentence or an allowed command was an npm release.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { brief, PERMISSIONS, USAGE_OUT } from "../src/runner-brief.ts";

const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const cli = readFileSync(
  new URL("../../../packages/passalong/src/runner.js", import.meta.url),
  "utf8",
);

test("a brief has the work, each way a run can start, and leaves the branch to the runner", () => {
  const b = brief({
    id: "abcdefgh",
    title: "Coupon dates",
    markdown: "# Coupon dates\n\nFix them.",
  });
  assert.match(b.start, /^You hold passalong work abcdefgh/);
  assert.match(b.start, /# Coupon dates\n\nFix them\./);
  assert.match(
    b.start,
    /First call the passalong MCP tool take with id abcdefgh: it hands you any notes/,
  );
  assert.match(b.start, /git push -u origin \{branch\}/);
  assert.match(b.start, /gh pr create --fill --head \{branch\}/);
  assert.match(b.start, /never a search of the code/);
  assert.match(b.start, /A\s+person reviews what you hand in/);
  assert.match(
    b.resume,
    /They have answered\. Call the passalong MCP tool take with id abcdefgh first/,
  );
  assert.match(b.paused, /because Claude's usage ran out or the runner was stopped/);
  for (const s of [b.resume, b.paused])
    assert.doesNotMatch(s, /Fix them\./, "the work is read with take");
  assert.deepEqual(b.permissions, PERMISSIONS);
  assert.equal(b.usage, USAGE_OUT);
});

test("a GitLab checkout ends in a merge request", () => {
  const b = brief({ id: "abcdefgh" }, "gitlab");
  assert.match(b.start, /git push -u origin \{branch\} -o merge_request\.create/);
  assert.doesNotMatch(b.start, /gh pr create/);
});

test("an unattended agent never force-pushes or throws work away", () => {
  for (const d of ["Bash(git push --force*)", "Bash(git reset --hard*)", "Bash(rm -rf *)"])
    assert.ok(PERMISSIONS.deny.includes(d), d);
  assert.ok(!PERMISSIONS.allow.some((a) => /git push(?! -u origin passalong)/.test(a)));
  assert.ok(new RegExp(USAGE_OUT, "i").test("Claude AI usage limit reached|1762444800"));
  assert.ok(!new RegExp(USAGE_OUT, "i").test("Added a daily limit to SMS sends."));
});

test("the CLI's own copy says the same about usage, for a server that sends no brief", () => {
  assert.ok(cli.includes(`export const USAGE_OUT =\n  "${USAGE_OUT}";`));
});

test("the runner is sent the brief with its work, for its checkout's host", () => {
  const route = index.slice(index.indexOf('app.post("/v1/tasks/next"'));
  assert.match(
    route.slice(0, 1500),
    /who\.alone === true\s+\? \{\s+runner: brief\(got\.task, who\.forge === "gitlab" \? "gitlab" : "github", \{\s+ci: who\.ci === true,/,
  );
});

test("in CI the agent can't wait for an answer, so it hands in the question instead", () => {
  const ci = brief({ id: "abcdefgh" }, "gitlab", { ci: true });
  assert.match(ci.start, /you\s+can't wait for it: this is a CI job/);
  assert.match(ci.start, /hand_in with the question in `note`/);
  assert.doesNotMatch(ci.start, /call ask with id/);
  assert.match(brief({ id: "abcdefgh" }).start, /call ask with id abcdefgh/);
});
