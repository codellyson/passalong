// Stands in for `claude -p` in the `passalong work` tests (test/task-flow.e2e.test.js). It lives outside test/ because
// `node --test` runs every .mjs under test/ as a test. It does what a real agent is told to:
// reports progress on the task it was handed and finishes it with a write-up — unless
// FAKE_AGENT_GIVES_UP is set, in which case it exits having done nothing, like a crashed session.
const p = await import("../src/passalong.js");
const id = process.env.PASSALONG_TASK;
if (!id || !process.argv.at(-1).includes(id)) throw new Error("no task in the prompt");
if (!process.env.FAKE_AGENT_GIVES_UP) {
  await p.taskProgress(id, "working", { cwd: process.cwd() });
  await p.finishTask(id, {
    markdown: `---\ntitle: did ${id}\nsummary: Did the task, and it holds.\n---\n\n## Problem\np\n\n## Steps\n1. x\n`,
    evidence: `node --test → 3 pass, 0 fail (${id})`,
    cwd: process.cwd(),
  });
}
