import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Isolated before the modules load, so nothing here can read a real account's config.
process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-followup-"));
delete process.env.PASSALONG_TOKEN;
const { FOLLOW_UPS_LEAD, followUpGuides, followUpNote, followUps, parentGuide } = await import(
  "../src/passalong.js"
);

test("a transfer guide says a follow-up is more context for it, and how to write one", () => {
  const note = followUpNote({ id: "k3mq2xa7" });
  assert.match(note, /publish_guide parent=k3mq2xa7/);
  assert.match(note, /more context for this guide/);
  assert.match(note, /whoever opens this guide gets it too/);
  // Not the old rule: context is worth adding whether or not the guide worked as written.
  assert.doesNotMatch(note, /depart|exactly as written/);
  // What the agent did and found is its hand-in. This note once listed it among the things to
  // publish, on every take, and agents published their evidence as a second guide.
  assert.doesNotMatch(note, /what you found doing it/);
  assert.match(note, /not a follow-up: it goes on hand_in/);
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

test("a follow-up arrives with the guide it came out of, and where that guide has got to", async () => {
  const parent = async () => ({
    guide: {
      id: "hveahejv",
      title: "Store Hours UI",
      state: "held",
      by: { name: "Ada Lovelace", handle: "ada" },
      markdown: "---\nid: hveahejv\n---\n\n## Goal\nOpen/close per day.\n",
    },
  });
  const out = await parentGuide({ id: "jn3juujr", parent: "hveahejv" }, { parent, loggedIn: on });
  assert.match(out, /^THIS IS A FOLLOW-UP TO hveahejv: Store Hours UI — held by Ada Lovelace\./);
  assert.match(out, /--- the guide it follows: hveahejv ---/);
  assert.match(out, /Open\/close per day\./, "the parent's own document comes with it");
  // The question the agent would otherwise have to go and answer itself.
  assert.match(out, /depends on hveahejv being done and it is not, say so rather than starting/);
  assert.ok(out.endsWith("\n\n"), "it sits in front of the document");
});

test("a guide that follows nothing says nothing, and neither does a failure", async () => {
  const never = () => assert.fail("no call for a guide with no parent");
  assert.equal(await parentGuide({ id: "k3mq2xa7" }, { parent: never, loggedIn: on }), "");
  assert.equal(
    await parentGuide(
      { id: "k3mq2xa7", parent: "hveahejv" },
      { parent: never, loggedIn: () => false },
    ),
    "",
  );
  const boom = async () => {
    throw new Error("offline");
  };
  assert.equal(
    await parentGuide({ id: "k3mq2xa7", parent: "hveahejv" }, { parent: boom, loggedIn: on }),
    "",
    "context is never worth failing the call over",
  );
  const gone = async () => ({ guide: null });
  assert.equal(
    await parentGuide({ id: "k3mq2xa7", parent: "hveahejv" }, { parent: gone, loggedIn: on }),
    "",
    "a parent in a team you are not in is not handed over",
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
  // And both carry the guide it follows, so a follow-up is never handed over on its own.
  assert.equal([...mcp.matchAll(/await passalong\.parentGuide\(meta\)/g)].length, 2);
});
