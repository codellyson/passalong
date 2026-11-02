// Stands in for `claude -p` in the `passalong work` tests (test/task-flow.e2e.test.js). It lives outside test/ because
// `node --test` runs every .mjs under test/ as a test. It does what a real agent is told to:
// reports progress on the work it was handed and hands it in with evidence — unless
// FAKE_AGENT_GIVES_UP is set, in which case it exits having done nothing, like a crashed session.
const p = await import("../src/passalong.js");
const id = process.env.PASSALONG_TASK;
if (!id || !process.argv.at(-1).includes(id)) throw new Error("no work in the prompt");
if (!process.env.FAKE_AGENT_GIVES_UP) {
  await p.progress(id, "working", { cwd: process.cwd() });
  await p.handIn(id, {
    note: `Did ${id}, and it holds.`,
    evidence: `node --test → 3 pass, 0 fail (${id})`,
    cwd: process.cwd(),
  });
}
