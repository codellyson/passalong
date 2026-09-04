import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ID_RE,
  newId,
  parse,
  sections,
  serialize,
  stamp,
  stripPlaceholders,
  template,
  validate,
} from "../src/guide.js";

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

test("sections keys on ## headings", () => {
  const s = sections(parse(SAMPLE).body);
  assert.deepEqual(Object.keys(s), ["Problem", "Steps", "Verification"]);
  assert.match(s.Verification, /401/);
});

test("validate rejects an untouched template and accepts a filled one", () => {
  const t = parse(template({ title: "x" }));
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
