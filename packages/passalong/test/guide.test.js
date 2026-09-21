import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bugGuide,
  ID_RE,
  newId,
  parse,
  sections,
  serialize,
  stamp,
  stripPlaceholders,
  TASK_SECTIONS,
  template,
  validate,
} from "../src/guide.js";
import { scaffold } from "../src/capture.js";

const SAMPLE = `---
id: k3mq2xa7
title: "Add Paystack webhook: verify signature"
created: 2026-09-03T10:00:00.000Z
author: Lukman
source_context: monieplan@main
status: published
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
  const out = serialize({ meta: { title: "a: b", tags: [] }, body: "x" });
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

test("sections keys on ## headings", () => {
  const s = sections(parse(SAMPLE).body);
  assert.deepEqual(Object.keys(s), ["Problem", "Steps", "Verification"]);
  assert.match(s.Verification, /401/);
});

test("validate rejects an untouched template and accepts a filled one", () => {
  const t = parse(template({ kind: "transfer", title: "x" }));
  assert.ok(validate(t).some((e) => /placeholders/.test(e)));
  const stripped = { meta: t.meta, body: stripPlaceholders(t.body) };
  assert.ok(validate(stripped).some((e) => /Problem/.test(e)));
  assert.deepEqual(validate(parse(SAMPLE)), []);
  assert.deepEqual(validate(parse(SAMPLE.replace("title:", "x_title:"))), [
    "frontmatter needs a title",
  ]);
});

test("stamp fills id, created, status, and defaults without overwriting", () => {
  const g = stamp(parse("---\ntitle: t\n---\n## Problem\np\n## Steps\ns"), { author: "me" });
  assert.match(g.meta.id, ID_RE);
  assert.ok(g.meta.created);
  assert.equal(g.meta.status, "draft");
  assert.equal(g.meta.author, "me");
  const kept = stamp(parse(SAMPLE), { author: "someone else" });
  assert.equal(kept.meta.author, "Lukman");
});

test("ids are short, unambiguous, and unique enough", () => {
  const ids = new Set(Array.from({ length: 500 }, () => newId()));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
});

test("a new guide is a task unless it says otherwise", () => {
  // Most guides assign work. Every template writes its kind out, because a guide with no kind:
  // line means a transfer to every client already installed.
  assert.equal(parse(template({ title: "x" })).meta.kind, "task");
  assert.equal(parse(template({ kind: "transfer", title: "x" })).meta.kind, "transfer");
  assert.match(template({ kind: "transfer", title: "x" }), /^kind: transfer$/m);
  assert.match(scaffold(), /^kind: transfer$/m, "capturing finished work is a transfer");
});

test("a bug keeps its repro out of Steps", () => {
  const bug = parse(template({ kind: "bug", title: "Undo kills the drag handle" }));
  assert.equal(bug.meta.kind, "bug");
  // `Steps` is what the MCP server tells an agent to follow. A repro under that heading is an
  // agent reproducing the defect and then reporting the guide as broken.
  assert.ok(!/^## Steps/m.test(bug.body), "a bug template must not contain a Steps section");
  assert.match(bug.body, /^## Reproduce/m);

  const filed = {
    meta: { title: "t", kind: "bug" },
    body: "## Problem\np\n## Reproduce\n1. do the thing",
  };
  assert.deepEqual(validate(filed), []);

  const mislabelled = {
    meta: { title: "t", kind: "bug" },
    body: "## Problem\np\n## Reproduce\n1. x\n## Steps\n1. x",
  };
  assert.ok(validate(mislabelled).some((e) => /Reproduce", not "## Steps/.test(e)));
});

test("a task is a brief with Acceptance and no Steps", () => {
  const task = parse(template({ kind: "task", title: "Add dark mode" }));
  assert.equal(task.meta.kind, "task");
  assert.deepEqual(Object.keys(sections(task.body)), TASK_SECTIONS);
  assert.ok(!/^## Steps/m.test(task.body), "a task template must not contain a Steps section");
  // Left empty rather than defaulted: a task written in one repo is often for another.
  assert.equal(task.meta.target_context, "");

  const written = {
    meta: { title: "t", kind: "task", target_context: "owner/repo" },
    body: "## Goal\ng\n## Acceptance\n- it works",
  };
  assert.deepEqual(validate(written), []);
  assert.equal(parse(serialize(written)).meta.target_context, "owner/repo");

  // Acceptance is what the work is approved against, so a task cannot go out without one.
  const open = { meta: { title: "t", kind: "task" }, body: "## Goal\ng" };
  assert.ok(validate(open).some((e) => /## Acceptance/.test(e)));
});

test("a guide with no kind is still a transfer guide", () => {
  assert.equal(parse(SAMPLE).meta.kind, undefined);
  assert.deepEqual(validate(parse(SAMPLE)), []);
  // ...and a transfer guide still requires the Steps a bug refuses.
  assert.ok(
    validate({ meta: { title: "t" }, body: "## Problem\np\n## Reproduce\nx" }).some((e) =>
      /## Steps/.test(e),
    ),
  );
});

test("bugGuide files a document the reader's rules accept", () => {
  const md = bugGuide({
    title: "Undo leaves section drag handles dead",
    problem: "Every handle in the column stops responding.",
    reproduce: "1. Drag a section\n2. Press undo",
    verification: "Undo restores the order and the section stays draggable.",
    severity: "s1",
    area: "storefront",
    report: "k4m2xq9a",
    environment: "staging",
  });
  const g = parse(md);
  assert.equal(g.meta.kind, "bug");
  assert.equal(g.meta.report, "k4m2xq9a");
  assert.equal(g.meta.area, "storefront");
  assert.deepEqual(g.meta.tags, ["bug", "staging", "storefront"]);
  assert.deepEqual(validate(g), []);
  // The whole point: what an agent is told to execute is not in here.
  assert.ok(!/^## Steps/m.test(g.body));
  assert.match(g.body, /^## Reproduce/m);
});

test("bugGuide leaves out the sections it has nothing for", () => {
  const g = parse(bugGuide({ title: "t", problem: "p", reproduce: "1. x" }));
  // An empty Verification is worse than none — it reads as "nobody knows what fixed looks like".
  assert.ok(!/## Verification/.test(g.body));
  assert.ok(!/## Gotchas/.test(g.body));
  assert.deepEqual(validate(g), []);
});

test("a bug says what it is inside the document", () => {
  const md = bugGuide({ title: "t", problem: "p", reproduce: "1. x" });
  // Not added by the route that serves it: `api.byLink` fetches share links through the .md
  // endpoint and re-serialises what it gets, so anything decorated on there would be written to
  // disk and published back on the next share. In the body it survives the round trip.
  assert.match(md, /^> \*\*Bug report\.\*\*/m);
  assert.ok(md.indexOf("Bug report.") < md.indexOf("## Problem"));
  const roundTripped = serialize(parse(md));
  assert.match(roundTripped, /^> \*\*Bug report\.\*\*/m);
  assert.deepEqual(validate(parse(md)), []);
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
      status: "published",
      tags: [],
    },
    body: "## Problem\nx\n\n## Steps\ny",
  });
  assert.match(doc, /^parent: zx9y8w42$/m);
  assert.equal(parse(doc).meta.parent, "zx9y8w42");
  // Lineage is where a guide came from, so it is written next to the other answer to that —
  // not down with `report`, which is the set a bug was filed into and a different question.
  assert.ok(doc.indexOf("source_context") < doc.indexOf("parent"));
  assert.ok(doc.indexOf("parent") < doc.indexOf("status"));
});

test("a parent is optional, and a malformed one is caught before publish", () => {
  const guide = {
    meta: { id: "k3mq2xa7", title: "One", tags: [] },
    body: "## Problem\nx\n\n## Steps\ny",
  };
  assert.deepEqual(validate(guide), [], "no parent at all is the ordinary case");
  // `parent:` was not a reserved field name until lineage existed, so a guide written before it
  // may carry one meaning something else. Refusing the value would make that document
  // unpublishable by its own author; the server drops a parent it cannot resolve instead.
  assert.deepEqual(
    validate({ ...guide, meta: { ...guide.meta, parent: "some-upstream-thing" } }),
    [],
    "a guide shared before lineage existed still re-shares",
  );
  assert.deepEqual(validate({ ...guide, meta: { ...guide.meta, parent: "k3mq2xa7" } }), [
    "a guide cannot follow itself",
  ]);
});

test("a guide that never named blockers does not grow a blocked_by line", () => {
  const out = serialize(parse("---\ntitle: t\n---\n\n## Problem\np"));
  assert.ok(!/blocked_by/.test(out), out);
  const task = parse(
    "---\ntitle: t\nkind: task\nblocked_by: [abc12345, def67890]\n---\n\n## Goal\ng",
  );
  assert.deepEqual(task.meta.blocked_by, ["abc12345", "def67890"]);
});

test("a bug carries its evidence in the document, where a fixer reads first", () => {
  const md = bugGuide({
    title: "Button does nothing",
    problem: "Clicking Save does not save.",
    reproduce: "1. Click Save.",
    evidence: [
      "https://passalong.dev/v1/shots/abc123",
      "![shot.png](https://passalong.dev/v1/shots/def456)",
    ],
  });
  // Under Problem, before Reproduce: for a visual defect the picture is the problem statement, and
  // a seventh heading would change the shape every reader keys on.
  const body = sections(md.split("---\n").slice(2).join("---\n"));
  assert.match(body.Problem, /!\[evidence\]\(https:\/\/passalong\.dev\/v1\/shots\/abc123\)/);
  // A caller holding the line attach_screenshot returned passes it through whole rather than
  // having it wrapped a second time.
  assert.match(body.Problem, /!\[shot\.png\]\(https:\/\/passalong\.dev\/v1\/shots\/def456\)/);
  assert.doesNotMatch(body.Problem, /!\[evidence\]\(!\[/);
  assert.equal(body.Reproduce, "1. Click Save.");
  assert.deepEqual(validate(parse(md)), []);
});

test("no evidence leaves a bug byte-for-byte what it was", () => {
  const args = { title: "T", problem: "P", reproduce: "R" };
  assert.equal(bugGuide(args), bugGuide({ ...args, evidence: [] }));
  assert.equal(bugGuide(args), bugGuide({ ...args, evidence: ["", "  "] }));
  assert.doesNotMatch(bugGuide(args), /!\[/);
});
