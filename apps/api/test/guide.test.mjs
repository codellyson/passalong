// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { body, parseMeta, setField, shotIds, split } from "../src/guide.ts";

const DOC = `---
id: k3mq2xa7
title: "Add Paystack webhook: verify signature"
status: published
stack_assumptions: [Next.js 15, Postgres]
tags:
  - paystack
  - webhooks
---

## Problem
Webhooks were accepted without checking the signature.
`;

test("parseMeta mirrors the CLI parser for strings and lists", () => {
  const m = parseMeta(DOC);
  assert.equal(m.id, "k3mq2xa7");
  assert.equal(m.title, "Add Paystack webhook: verify signature");
  assert.deepEqual(m.stack_assumptions, ["Next.js 15", "Postgres"]);
  assert.deepEqual(m.tags, ["paystack", "webhooks"]);
  assert.deepEqual(parseMeta("no frontmatter"), { tags: [], stack_assumptions: [] });
});

test("setField replaces an existing field in place", () => {
  const out = setField(DOC, "status", "consumed");
  assert.match(out, /^status: consumed$/m);
  assert.equal(parseMeta(out).status, "consumed");
  assert.equal(body(out), body(DOC), "body untouched");
  assert.doesNotMatch(out, /status: published/);
});

test("setField appends a missing field and quotes what YAML would misread", () => {
  const out = setField(DOC, "url", "https://x.test/g/k3mq2xa7/abc");
  assert.match(out, /^url: "https:\/\/x\.test\/g\/k3mq2xa7\/abc"$/m);
  assert.equal(parseMeta(out).url, "https://x.test/g/k3mq2xa7/abc");
  assert.ok(split(out), "still a valid frontmatter document");
});

test("setField on a document with no frontmatter creates one", () => {
  const out = setField("## Problem\nx", "id", "abcd2345");
  assert.equal(parseMeta(out).id, "abcd2345");
  assert.equal(body(out).trim(), "## Problem\nx");
});

test("a screenshot is readable with its id alone", async () => {
  // The route the auth middleware forgot. Evidence lives inside a guide, and a guide travels as
  // markdown to anyone holding its share key: an image that 401s renders as a broken image for
  // exactly the reader it was attached for. Production found this; a signed-in browser hid it.
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const guard =
    /const publicShot = \(method: string, path: string\) =>\s*method === "GET" && (\/[^;]+\/)\.test\(path\)/.exec(
      src,
    );
  assert.ok(guard, "the public-shot exception is gone from the auth middleware");
  const re = new RegExp(guard[1].slice(1, -1));
  assert.ok(re.test("/v1/shots/jjeqrdsg9eam"));
  assert.ok(!re.test("/v1/shots"));
  assert.ok(!re.test("/v1/guides/abc12345"));
});

test("a document says which screenshots belong to it", () => {
  const md = [
    "![one](https://passalong.dev/v1/shots/jjeqrdsg9eam)",
    "![again, same shot](https://passalong.dev/v1/shots/jjeqrdsg9eam)",
    "![two](http://localhost:3006/v1/shots/abc123def456)",
    "not a shot: https://passalong.dev/v1/guides/k3mq2xa7",
    "not a shot either: /v1/shots/",
  ].join("\n\n");
  assert.deepEqual(shotIds(md), ["jjeqrdsg9eam", "abc123def456"]);
  assert.deepEqual(shotIds("nothing here"), []);
});
