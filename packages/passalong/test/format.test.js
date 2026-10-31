import assert from "node:assert/strict";
import { test } from "node:test";
import { ID_RE, newId, parse, SUMMARY_MAX, serialize, stamp, validate } from "../src/work.js";

const SAMPLE = `---
id: k3mq2xa7
title: "Add Paystack webhook: verify signature"
summary: Webhook signatures are now checked before anything is stored. Done and working.
created: 2026-09-03T10:00:00.000Z
author: Lukman
source_context: monieplan@main
status: ready
stack_assumptions: [Next.js 15, Postgres]
tags:
  - paystack
  - webhooks
---

## Problem
Webhooks were accepted without checking the signature.

## Steps
1. ASSUMES: Next.js route handlers. Add \`app/api/paystack/route.ts\`.

## Verification
\`curl -X POST ...\` returns 401 without a valid signature.
`;

test("parse round-trips frontmatter and body", () => {
  const g = parse(SAMPLE);
  assert.equal(g.meta.id, "k3mq2xa7");
  assert.equal(g.meta.title, "Add Paystack webhook: verify signature");
  assert.deepEqual(g.meta.stack_assumptions, ["Next.js 15", "Postgres"]);
  assert.deepEqual(g.meta.tags, ["paystack", "webhooks"]);
  assert.match(g.body, /^## Problem/);
  const again = parse(serialize(g));
  assert.deepEqual(again, g);
});

test("serialize quotes values YAML would misread", () => {
  const out = serialize({
    meta: { title: "a: b", summary: "Said to a person for the test.", tags: [] },
    body: "x",
  });
  assert.match(out, /title: "a: b"/);
  assert.match(out, /tags: \[\]/);
});

test("a list item keeps the commas inside it", () => {
  const meta = {
    title: "t",
    stack_assumptions: ["Khaime API /api/v1, Express, guards isLoggedIn + isBusinessAdmin"],
    tags: ["b2b"],
  };
  const out = serialize({ meta, body: "## Problem\np\n## Steps\ns" });
  // The writer quotes it because of the commas; the reader has to honour that rather than split on
  // them, or three assumptions come back as five fragments with stray quotes attached.
  assert.match(out, /stack_assumptions: \["Khaime API/);
  assert.deepEqual(parse(out).meta.stack_assumptions, meta.stack_assumptions);
});

test("a block list parses flush with its key", () => {
  const g = parse(SAMPLE.replace("  - paystack\n  - webhooks", "- paystack\n- webhooks"));
  assert.deepEqual(g.meta.tags, ["paystack", "webhooks"]);
});

test("validate asks for a title and a summary, and nothing of the body", () => {
  // The body is free markdown: no heading is required or refused, whatever the work is.
  for (const body of ["", "The upload button does nothing.", "## Steps\n1. x", "## Goal\ng"])
    assert.deepEqual(validate({ meta: { title: "t", summary: "A summary." }, body }), [], body);
  assert.deepEqual(validate(parse(SAMPLE)), []);
  assert.deepEqual(validate(parse(SAMPLE.replace("title:", "x_title:"))), [
    "frontmatter needs a title",
  ]);
});

test("stamp fills id, created, status, and defaults without overwriting", () => {
  const g = stamp(
    parse(
      "---\ntitle: t\nsummary: Said to a person for the test.\n---\n## Problem\np\n## Steps\ns",
    ),
    { author: "me" },
  );
  assert.match(g.meta.id, ID_RE);
  assert.ok(g.meta.created);
  assert.equal(g.meta.status, "ready", "Ready unless whoever wrote it said draft");
  assert.equal(g.meta.author, "me");
  const kept = stamp(parse(SAMPLE), { author: "someone else" });
  assert.equal(kept.meta.author, "Lukman");
});

test("ids are short, unambiguous, and unique enough", () => {
  const ids = new Set(Array.from({ length: 500 }, () => newId()));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
});

test("tags are one style at both ends of the module", () => {
  const md = `---
id: aa
title: "One"
tags:
  - additional_information
  - Custom Fields
  - custom--fields
---

## Problem
x
`;
  const doc = parse(md);
  assert.deepEqual(
    doc.meta.tags,
    ["additional-information", "custom-fields"],
    "read normalised, and the two spellings of one idea are now one tag",
  );
  assert.match(
    serialize(doc),
    /^tags: \[additional-information, custom-fields\]$/m,
    "and written back that way, so the document the author pulls agrees",
  );
});

test("a group address survives being written to frontmatter and read back", () => {
  const doc = serialize({
    meta: { id: "aa", title: "One", team: "khaime", to: "#frontend", tags: [] },
    body: "## Problem\nx",
  });
  // `#` is quoted on the way out, or YAML reads the rest of the line as a comment.
  assert.match(doc, /^to: "#frontend"$/m);
  assert.equal(parse(doc).meta.to, "#frontend");
});

test("a parent survives the round trip and sits with the provenance fields", () => {
  const doc = serialize({
    meta: {
      id: "k3mq2xa7",
      title: "One",
      source_context: "passalong@master",
      parent: "zx9y8w42",
      status: "ready",
      tags: [],
    },
    body: "## Problem\nx\n\n## Steps\ny",
  });
  assert.match(doc, /^parent: zx9y8w42$/m);
  assert.equal(parse(doc).meta.parent, "zx9y8w42");
  // Lineage is where work came from, so it is written next to the other answer to that.
  assert.ok(doc.indexOf("source_context") < doc.indexOf("parent"));
  assert.ok(doc.indexOf("parent") < doc.indexOf("status"));
});

test("a parent is optional, and a malformed one is caught before publish", () => {
  const work = {
    meta: { id: "k3mq2xa7", title: "One", summary: "One thing.", tags: [] },
    body: "## Problem\nx\n\n## Steps\ny",
  };
  assert.deepEqual(validate(work), [], "no parent at all is the ordinary case");
  // `parent:` was not a reserved field name until lineage existed, so work written before it
  // may carry one meaning something else. Refusing the value would make that document
  // unpublishable by its own author; the server drops a parent it cannot resolve instead.
  assert.deepEqual(
    validate({ ...work, meta: { ...work.meta, parent: "some-upstream-thing" } }),
    [],
    "work shared before lineage existed still re-shares",
  );
  assert.deepEqual(validate({ ...work, meta: { ...work.meta, parent: "k3mq2xa7" } }), [
    "work cannot come out of itself",
  ]);
});

test("work that never named blockers does not grow a blocked_by line", () => {
  const out = serialize(
    parse("---\ntitle: t\nsummary: Said to a person for the test.\n---\n\n## Problem\np"),
  );
  assert.ok(!/blocked_by/.test(out), out);
  const task = parse(
    "---\ntitle: t\nsummary: Said to a person for the test.\nblocked_by: [abc12345, def67890]\n---\n\n## Goal\ng",
  );
  assert.deepEqual(task.meta.blocked_by, ["abc12345", "def67890"]);
});

test("every piece of work says what it is to a person, and is refused when it does not", () => {
  const work = (summary) => ({
    meta: { title: "t", summary },
    body: "## Problem\np",
  });
  assert.deepEqual(validate(work("What this is, for a person.")), []);
  for (const bare of [undefined, "", "   "])
    assert.ok(
      validate(work(bare)).some((e) => /summary/.test(e)),
      `no summary is refused: ${JSON.stringify(bare)}`,
    );
  assert.ok(validate(work("x".repeat(SUMMARY_MAX + 1))).some((e) => /400 at most/.test(e)));
  assert.deepEqual(validate(work("x".repeat(SUMMARY_MAX))), [], "the limit itself is allowed");
  // It is the document's first fact after the title, and it round-trips like any string.
  const md = serialize(work("A colon: and a comma, kept."));
  assert.match(md, /^title: t\nsummary: "A colon: and a comma, kept\."$/m);
  assert.equal(parse(md).meta.summary, "A colon: and a comma, kept.");
});

test("a document that says what kind it is, is refused by name", () => {
  // Work has no kinds (docs/WORK.md). An old export or an old client still writes the line, and
  // carrying it would put back an answer nothing reads, so the author is told to take it out.
  for (const k of ["task", "bug", ""]) {
    const errors = validate(parse(SAMPLE.replace("status:", `kind: ${k}\nstatus:`)));
    assert.ok(
      errors.some((e) => /`kind:` is gone/.test(e)),
      `kind: ${k} -> ${errors}`,
    );
  }
  assert.deepEqual(validate(parse(SAMPLE)), [], "and without it the same document is fine");
});
