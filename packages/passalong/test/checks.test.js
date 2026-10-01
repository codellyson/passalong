import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { refusal, runCheck, runChecks } from "../src/checks.js";

test("a check with no command is left exactly as the agent wrote it", () => {
  const r = runCheck({ check: "the badge reads 3", ran: "opened the hub, it reads 3" });
  assert.deepEqual(r, { check: "the badge reads 3", ran: "opened the hub, it reads 3" });
  // Nothing was run, so there is nothing to report about a run.
  assert.equal("cmd" in r, false);
  assert.equal("exit" in r, false);
});

test("a command that passes records its output, not the agent's account of it", () => {
  const r = runCheck({ check: "it greets", ran: "trust me, it greets", cmd: "echo hello" });
  assert.equal(r.exit, 0);
  assert.equal(r.ok, true);
  assert.equal(r.cmd, "echo hello");
  assert.match(r.ran, /^\$ echo hello\nhello$/);
  // The sentence the agent supplied is gone: the process is the witness now.
  assert.doesNotMatch(r.ran, /trust me/);
});

test("a non-zero exit is not ok, and says what it returned", () => {
  const r = runCheck({ check: "tests pass", cmd: "echo 2 failing; exit 1" });
  assert.equal(r.exit, 1);
  assert.equal(r.ok, false);
  assert.match(r.ran, /2 failing/);
});

test("a silent command is evidence, and does not read as blank", () => {
  // `test -f` prints nothing. Under the old rule this was a 16-character problem; the exit code is
  // the whole point of a check like this one.
  const dir = mkdtempSync(join(tmpdir(), "passalong-checks-"));
  writeFileSync(join(dir, "built.js"), "//\n");
  const r = runCheck({ check: "it builds", cmd: "test -f built.js" }, { cwd: dir });
  assert.equal(r.ok, true);
  assert.match(r.ran, /\(no output; exited 0\)/);
});

test("the command runs where the work is, not where the server started", () => {
  const dir = mkdtempSync(join(tmpdir(), "passalong-checks-cwd-"));
  writeFileSync(join(dir, "only-here.txt"), "x\n");
  assert.equal(runCheck({ check: "here", cmd: "test -f only-here.txt" }, { cwd: dir }).ok, true);
  assert.equal(runCheck({ check: "there", cmd: "test -f only-here.txt" }).ok, false);
});

test("a command that never ran is not a check that found nothing wrong", () => {
  const r = runCheck({ check: "slow", cmd: "sleep 5" }, { timeoutMs: 400 });
  assert.equal(r.ok, false);
  // null, not a number: "it did not run" has to stay distinguishable from "it ran and failed".
  assert.equal(r.exit, null);
  assert.match(r.ran, /did not finish within/);
});

test("output is capped from the end, where a runner puts what went wrong", () => {
  const r = runCheck({ check: "loud", cmd: "seq 1 200000; echo THE-LAST-LINE" });
  assert.match(r.ran, /THE-LAST-LINE/);
  assert.match(r.ran, /earlier characters cut/);
  assert.ok(r.ran.length < 4600, `kept ${r.ran.length} characters`);
});

test("checks stop at the first failure", () => {
  const done = runChecks([
    { check: "a", cmd: "true" },
    { check: "b", cmd: "exit 2" },
    { check: "c", cmd: "echo should-not-run" },
  ]);
  assert.equal(done.checks.length, 2);
  assert.equal(done.failed.check, "b");
  assert.equal(done.ran, 2);
});

test("checks with no command do not stop anything", () => {
  const done = runChecks([
    { check: "a", ran: "read it by hand" },
    { check: "b", cmd: "true" },
  ]);
  assert.equal(done.failed, null);
  assert.equal(done.checks.length, 2);
  // Only the one with a command counts as run.
  assert.equal(done.ran, 1);
});

test("the refusal tells the agent which check, and hands back its own output", () => {
  const done = runChecks([{ check: "the suite is green", cmd: "echo boom >&2; exit 1" }]);
  const said = refusal(done.failed, { ran: done.ran, total: 3 });
  assert.match(said, /not handed in/);
  assert.match(said, /exited 1/);
  assert.match(said, /boom/);
  assert.match(said, /check 1 of 3, "the suite is green"/);
  assert.match(said, /still hold this/);
});

test("a failing step inside a pipeline fails the check, whatever the last step returned", () => {
  // The shape a real hand-in used: the git command died, head exited 0, and it was recorded as met.
  const piped = runCheck({
    check: "log",
    cmd: "(echo 'fatal: ambiguous argument'; exit 128) | head -5",
  });
  assert.equal(piped.ok, false);
  assert.equal(piped.exit, 128);
  const grepped = runCheck({
    check: "tests",
    cmd: "(echo 'Tests: 1 failed'; exit 1) 2>&1 | grep Tests:",
  });
  assert.equal(grepped.ok, false, "grep finding the summary does not make a failing run pass");
});

test("a writer cut short by head is not a failure", () => {
  const r = runCheck({ check: "lines", cmd: "yes | head -3" });
  assert.equal(r.ok, true);
  assert.equal(r.exit, 141);
  assert.match(r.ran, /not a failure/);
});
