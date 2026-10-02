// The Claude Code hooks `passalong setup` installs, as pure functions: what a session is told when
// it starts, whether it may stop, and how the hooks are merged into settings. See docs/V2.md §11.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HOOK,
  nowText,
  STATUS_LINE,
  statusText,
  stopVerdict,
  withHooks,
  withStatusLine,
} from "../src/hooks.js";

const HELD = {
  id: "k3mq2xa7",
  title: "Rate-limit token creation",
  kind: "task",
  state: "claimed",
  note: "429 in place, writing the test",
  lease_until: "2026-09-22T10:30:00.000Z",
};

test("a session starts knowing what this worktree holds, and what to do about it", () => {
  const said = nowText({ held: HELD, waiting: { ready: 2, inbox: 1 } });
  assert.match(said, /You hold k3mq2xa7 \(task\): Rate-limit token creation/);
  assert.match(said, /429 in place, writing the test/);
  assert.match(said, /take k3mq2xa7/, "carry on by taking it again, which resumes it");
  assert.match(said, /hand_in|pass/);
});

test("with nothing held it says what is waiting, and with nothing at all it says nothing", () => {
  assert.match(
    nowText({ held: null, waiting: { ready: 2, inbox: 1 } }),
    /2 ready tasks for this repo/,
  );
  assert.match(nowText({ held: null, waiting: { ready: 2, inbox: 1 } }), /1 guide handed to you/);
  assert.equal(nowText({ held: null, waiting: { ready: 0, inbox: 0 } }), "");
});

test("a stalled hold says it went quiet, so the agent knows to report before anything else", () => {
  assert.match(nowText({ held: { ...HELD, state: "stalled" }, waiting: {} }), /stalled/);
});

test("a session holding work is stopped once, told what to call, then let go", () => {
  const v = stopVerdict({ held: HELD, input: { stop_hook_active: false } });
  assert.equal(v.decision, "block");
  assert.match(v.reason, /k3mq2xa7/);
  assert.match(v.reason, /hand_in/);
  assert.match(v.reason, /pass/);
  assert.match(v.reason, /progress/, "stopping mid-way is allowed, with a note saying where");
  // Already continuing because of this hook: never twice, or a session could not end at all.
  assert.equal(stopVerdict({ held: HELD, input: { stop_hook_active: true } }), null);
  assert.equal(stopVerdict({ held: null, input: {} }), null);
});

test("setup adds both hooks once, and keeps everything else in settings", () => {
  const before = {
    model: "opus",
    hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }] },
  };
  const after = withHooks(before);
  assert.equal(after.model, "opus");
  const commands = (event) => after.hooks[event].flatMap((m) => m.hooks.map((h) => h.command));
  assert.deepEqual(commands("SessionStart"), [HOOK.session]);
  assert.deepEqual(commands("Stop"), ["say done", HOOK.stop]);
  assert.deepEqual(withHooks(after), after, "running setup again changes nothing");
  assert.equal(before.hooks.Stop.length, 1, "the settings passed in are not changed");
});

// ---- the status line (docs/V2.md §11) -------------------------------------------------------------

test("the status line names what you hold, and what needs you", () => {
  const line = statusText({ held: HELD, needs: 2, ready: 5 });
  assert.match(line, /k3mq2xa7/);
  assert.match(line, /429 in place/);
  assert.match(line, /2 need you/);
  assert.match(line, /5 ready/);
  assert.doesNotMatch(line, /\n/, "one line");
});

test("a long note is cut, a stalled hold says so, and a quiet day says clear", () => {
  const long = statusText({ held: { ...HELD, note: "x".repeat(200) }, needs: 0, ready: 0 });
  assert.ok(long.length < 90, `kept short: ${long.length}`);
  assert.match(statusText({ held: { ...HELD, state: "stalled" }, needs: 0, ready: 0 }), /stalled/);
  assert.equal(statusText({ held: null, needs: 0, ready: 0 }), "passalong · clear");
  assert.equal(statusText({ held: null, needs: 1, ready: 0 }), "passalong · 1 needs you");
});

test("setup adds the status line only where there is none, and never replaces one", () => {
  const added = withStatusLine({ model: "opus" });
  assert.deepEqual(added.statusLine, {
    type: "command",
    command: STATUS_LINE,
    refreshInterval: 30,
  });
  assert.equal(added.model, "opus");
  const theirs = { statusLine: { type: "command", command: "~/my-line.sh" } };
  assert.deepEqual(withStatusLine(theirs), theirs, "someone else's status line is left alone");
  assert.deepEqual(withStatusLine(added), added, "running setup again changes nothing");
});

test("an agent that asked a question is allowed to stop and wait", () => {
  // It was told to stop after `ask`; blocking it would make the instruction and the hook disagree.
  assert.equal(
    stopVerdict({ held: { ...HELD, asking: "Settings or the header?" }, input: {} }),
    null,
  );
  // The older way of saying the same thing is not heard as a question, so it is still stopped once.
  assert.ok(stopVerdict({ held: { ...HELD, note: "BLOCKED: which?" }, input: {} }));
});

test("the session-start line says when the person has written, because nothing else will", () => {
  const base = { id: "k3mq2xa7", kind: "task", title: "T", state: "claimed" };
  assert.doesNotMatch(nowText({ held: base }), /waiting for you/);
  assert.match(
    nowText({ held: { ...base, replies: 1 } }),
    /1 message from the person is waiting for you: call take k3mq2xa7/,
  );
  assert.match(
    nowText({ held: { ...base, replies: 3 } }),
    /3 messages from the person are waiting/,
  );
});
