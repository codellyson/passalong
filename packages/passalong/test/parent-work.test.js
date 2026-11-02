import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Isolated before the modules load, so nothing here can read a real account's config.
process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-parent-"));
delete process.env.PASSALONG_TOKEN;
const { AFTER, parentWork } = await import("../src/passalong.js");

const on = () => true;

test("what an agent learns goes into the project's documents, and new work names its parent", () => {
  assert.match(AFTER, /project's documents \(find_projects, read_document, save_document\)/);
  assert.match(AFTER, /create_work with `parent`/);
  assert.match(AFTER, /goes on hand_in/);
  // A comment, so it cannot be mistaken for part of the work by anyone who writes it back out.
  assert.match(AFTER, /^<!-- passalong:[\s\S]*-->$/);
});

test("work arrives with the work it came out of, and where that has got to", async () => {
  const parent = async () => ({
    work: {
      id: "hveahejv",
      title: "Store Hours UI",
      state: "held",
      by: { name: "Ada Lovelace", handle: "ada" },
      markdown: "---\nid: hveahejv\n---\n\nOpen/close per day.\n",
    },
  });
  const out = await parentWork({ id: "jn3juujr", parent: "hveahejv" }, { parent, loggedIn: on });
  assert.match(out, /^THIS CAME OUT OF hveahejv: Store Hours UI — held by Ada Lovelace\./);
  assert.match(out, /--- the work it came out of: hveahejv ---/);
  assert.match(out, /Open\/close per day\./, "the parent's own text comes with it");
  assert.match(out, /depends on hveahejv being done and it is not, say so rather than starting/);
  assert.ok(out.endsWith("\n\n"), "it sits in front of the document");
});

test("work that came out of nothing says nothing, and neither does a failure", async () => {
  const never = () => assert.fail("no call for work with no parent");
  assert.equal(await parentWork({ id: "k3mq2xa7" }, { parent: never, loggedIn: on }), "");
  assert.equal(
    await parentWork(
      { id: "k3mq2xa7", parent: "hveahejv" },
      { parent: never, loggedIn: () => false },
    ),
    "",
  );
  const boom = async () => {
    throw new Error("offline");
  };
  assert.equal(
    await parentWork({ id: "k3mq2xa7", parent: "hveahejv" }, { parent: boom, loggedIn: on }),
    "",
    "context is never worth failing the call over",
  );
  assert.equal(
    await parentWork(
      { id: "k3mq2xa7", parent: "hveahejv" },
      { parent: async () => ({ work: null }), loggedIn: on },
    ),
    "",
    "a parent in a team you are not in is not handed over",
  );
});

// Read rather than imported: the two servers are held to the same behaviour by their source.
test("both servers hand over the parent with the work, on take and on find_work", () => {
  const stdio = readFileSync(new URL("../src/mcp.js", import.meta.url), "utf8");
  const http = readFileSync(new URL("../../../apps/api/src/mcp-http.ts", import.meta.url), "utf8");
  assert.equal([...stdio.matchAll(/await passalong\.parentWork\(/g)].length, 2);
  assert.equal([...http.matchAll(/await parentOf\(call, /g)].length, 2);
  assert.match(stdio, /passalong\.AFTER/, "and stdio says where what it learns goes");
  assert.match(http, /\$\{AFTER\}/, "and so does HTTP");
});
