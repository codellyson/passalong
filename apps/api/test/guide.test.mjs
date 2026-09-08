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

test("the sweep only takes unclaimed uploads, and takes their objects too", async () => {
  const { sweepOrphans, shotKey } = await import("../src/shots.ts");
  assert.equal(shotKey("abc123", "image/jpeg"), "abc123.jpg");
  // An unknown type still names something, because the row is the only record of the extension
  // and a sweep that throws leaves the bucket growing.
  assert.equal(shotKey("abc123", "application/pdf"), "abc123.png");

  const asked = [];
  const deletedKeys = [];
  const rows = [
    { id: "aaaaaa111111", type: "image/png" },
    { id: "bbbbbb222222", type: "image/webp" },
  ];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            asked.push({ sql, args });
            return {
              all: async () => ({ results: rows }),
              run: async () => ({}),
            };
          },
        };
      },
    },
    SHOTS: { delete: async (keys) => deletedKeys.push(...keys) },
  };

  const { swept } = await sweepOrphans(env, { hours: 24, limit: 500 });
  assert.equal(swept, 2);
  assert.deepEqual(deletedKeys, ["aaaaaa111111.png", "bbbbbb222222.webp"]);

  const [select, remove] = asked;
  assert.match(select.sql, /guide_id = ''/, "only unclaimed uploads");
  assert.match(select.sql, /created < \?/, "and only ones old enough to be abandoned");
  const cutoff = Date.parse(select.args[0]);
  const age = Date.now() - cutoff;
  assert.ok(age > 23 * 3600_000 && age < 25 * 3600_000, `cutoff should be ~24h ago, was ${age}ms`);
  assert.match(remove.sql, /^DELETE FROM shot/);
  assert.deepEqual(remove.args, ["aaaaaa111111", "bbbbbb222222"]);
});

test("the sweep does nothing when there is nothing to take", async () => {
  const { sweepOrphans } = await import("../src/shots.ts");
  let deleted = false;
  const env = {
    DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) },
    SHOTS: {
      delete: async () => {
        deleted = true;
      },
    },
  };
  assert.deepEqual(await sweepOrphans(env), { swept: 0, deferred: 0 });
  assert.equal(deleted, false, "an empty sweep must not touch the bucket");
});

test("a bucket that refuses leaves the rows for tomorrow", async () => {
  const { sweepOrphans } = await import("../src/shots.ts");
  let rowsDeleted = false;
  const env = {
    DB: {
      prepare: (sql) => ({
        bind: () => ({
          all: async () => ({ results: [{ id: "aaaaaa111111", type: "image/png" }] }),
          run: async () => {
            if (/DELETE/.test(sql)) rowsDeleted = true;
            return {};
          },
        }),
      }),
    },
    SHOTS: {
      delete: async () => {
        throw new Error("R2 said no");
      },
    },
  };
  // The row is the only record that the object exists. Delete it after a failed bucket call and
  // the file is stranded for good, because nothing will ever look for it again.
  assert.deepEqual(await sweepOrphans(env), { swept: 0, deferred: 1 });
  assert.equal(rowsDeleted, false, "rows must survive a bucket failure");
});
