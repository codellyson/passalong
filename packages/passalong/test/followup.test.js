import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Isolated before the modules load, so nothing here can read a real account's config.
process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-followup-"));
delete process.env.PASSALONG_TOKEN;
const { FOLLOW_UPS_LEAD, followUpGuides, followUpNote, followUps } = await import(
  "../src/passalong.js"
);

test("a transfer guide says a follow-up is more context for it, and how to write one", () => {
  const note = followUpNote({ id: "k3mq2xa7" });
  assert.match(note, /publish_guide parent=k3mq2xa7/);
  assert.match(note, /more context for this guide/);
  assert.match(note, /whoever opens this guide gets it too/);
  // Not the old rule: context is worth adding whether or not the guide worked as written.
  assert.doesNotMatch(note, /depart|exactly as written/);
  // A comment, so it cannot be mistaken for part of the guide by anyone who writes it back out.
  assert.match(note, /^<!-- passalong:[\s\S]*-->$/);
});

test("a bug report asks for a fix worth repeating, as context for the bug", () => {
  const note = followUpNote({ id: "bugbug12", kind: "bug" });
  assert.match(note, /once this is fixed/);
  assert.match(note, /more context for this bug/);
  assert.match(note, /parent=bugbug12/);
});

test("no id, no note — there is nothing to name as the parent", () => {
  assert.equal(followUpNote({}), "");
  assert.equal(followUpNote(), "");
});

const on = () => true;
const stub =
  (guides, seen = []) =>
  async (id, opts) => {
    seen.push({ id, opts });
    return { guides };
  };

test("follow-ups come after a guide as one block, oldest first, each with its body", async () => {
  const seen = [];
  const out = await followUps(
    { id: "k3mq2xa7" },
    {
      loggedIn: on,
      children: stub(
        [
          {
            id: "aaaa2222",
            title: "Postgres 16 needs a flag",
            markdown: "---\nid: aaaa2222\n---\n\nfirst\n\n",
          },
          { id: "bbbb3333", title: "", markdown: "second" },
        ],
        seen,
      ),
    },
  );
  assert.deepEqual(seen, [{ id: "k3mq2xa7", opts: { markdown: true } }]);
  assert.equal(
    out,
    `${FOLLOW_UPS_LEAD}\n\n` +
      "--- follow-up aaaa2222: Postgres 16 needs a flag ---\n---\nid: aaaa2222\n---\n\nfirst\n\n" +
      "--- follow-up bbbb3333: untitled ---\nsecond",
  );
  assert.match(FOLLOW_UPS_LEAD, /^FOLLOW-UPS — more context added to this guide, oldest first\./);
});

test("no follow-ups, no sync, no id, or a failure: nothing, and never an error", async () => {
  assert.equal(await followUps({ id: "k3mq2xa7" }, { loggedIn: on, children: stub([]) }), "");
  let asked = false;
  const never = async () => {
    asked = true;
    return { guides: [{ id: "x", title: "x", markdown: "x" }] };
  };
  assert.equal(await followUps({ id: "k3mq2xa7" }, { loggedIn: () => false, children: never }), "");
  assert.equal(await followUps({}, { loggedIn: on, children: never }), "");
  assert.equal(asked, false, "logged out or without an id, the server is not asked");
  const boom = async () => {
    throw new Error("could not reach passalong.dev");
  };
  assert.equal(await followUps({ id: "k3mq2xa7" }, { loggedIn: on, children: boom }), "");
});

test("the CLI's plain listing is read oldest first too", async () => {
  const rows = await followUpGuides(
    { id: "k3mq2xa7" },
    { loggedIn: on, children: stub([{ id: "newer111" }, { id: "older222" }]) },
  );
  assert.deepEqual(
    rows.map((g) => g.id),
    ["older222", "newer111"],
  );
});

// Read rather than imported: importing mcp.js starts a server.
test("the local server defines a follow-up on connect, and hands them over with the guide", () => {
  const mcp = readFileSync(new URL("../src/mcp.js", import.meta.url), "utf8");
  assert.match(mcp, /FOLLOW-UP IS MORE CONTEXT FOR A GUIDE, WRITTEN AS ITS OWN GUIDE/);
  assert.doesNotMatch(mcp, /worked exactly as written|departed from/);
  assert.match(mcp, /passalong\.followUpNote\(meta\)/, "and with the guide it is working from");
  // Both ways an agent opens a guide carry its follow-ups.
  assert.equal([...mcp.matchAll(/await passalong\.followUps\(meta\)/g)].length, 2);
});
