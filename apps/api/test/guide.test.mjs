// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  body,
  parseMeta,
  SETTABLE,
  STATUSES,
  setField,
  setList,
  shotIds,
  split,
  tag,
  tagList,
  unreachableImages,
} from "../src/guide.ts";

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

test("a guide can arrive as itself or wrapped in JSON", async () => {
  // The route reads the body one of two ways depending on content-type. An agent platform that
  // builds calls from the OpenAPI document can only send JSON, so without the wrapper the one
  // route that publishes anything is the one route those agents cannot reach.
  // Checked against the source because the Hono app is not importable from a test — see the note
  // in hosts.ts. Matched in pieces rather than as one line: the formatter decides where the line
  // breaks go, and a test that fails when biome wraps a line is testing the formatter.
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  for (const piece of [
    "const sentJson =",
    "content-type",
    '=== "application/json"',
    'typeof wrapper?.markdown === "string"',
  ]) {
    assert.ok(src.includes(piece), `the JSON body branch should still contain: ${piece}`);
  }

  const { openapi } = await import("../src/openapi.ts");
  const doc = openapi("https://passalong.dev");
  const body = doc.paths["/v1/guides/{id}"].put.requestBody.content;
  assert.ok(body["application/json"], "the schema must offer a JSON body");
  assert.ok(body["text/markdown"], "and keep the markdown one the CLI sends");
  assert.deepEqual(body["application/json"].schema.required, ["markdown"]);
});

test("tags come back in one style, however they were typed", () => {
  assert.deepEqual(
    tagList(["Custom Fields", "additional_information", "#bug", "", "  ", "custom--fields"]),
    ["custom-fields", "additional-information", "bug"],
    "one style, blanks dropped, and two spellings of one idea collapse to one tag",
  );
  assert.equal(tag("a".repeat(40)), "a".repeat(32), "capped");
  assert.equal(tag("-lead-and-trail-"), "lead-and-trail");
  assert.equal(tag("!!!"), "", "a tag made only of punctuation is not a tag");
  assert.deepEqual(tagList(undefined), []);
  assert.deepEqual(tagList("one_tag"), ["one-tag"], "a scalar is a list of one");
});

test("parseMeta normalises the tags it reads, so old guides read as new ones", () => {
  const meta = parseMeta("---\nid: aa\ntags: [Custom Fields, additional_information]\n---\n\nx\n");
  assert.deepEqual(meta.tags, ["custom-fields", "additional-information"]);
});

test("setList replaces a block sequence rather than orphaning its items", () => {
  const md =
    "---\nid: aa\ntags:\n  - additional_information\n  - Custom Fields\nstatus: published\n---\n\n## Problem\nx\n";
  const out = setList(md, "tags", parseMeta(md).tags);
  assert.match(out, /^tags: \[additional-information, custom-fields\]$/m);
  assert.ok(!out.includes("- Custom Fields"), "the old items must not be left behind");
  assert.match(out, /^status: published$/m, "and the key after them must survive");
  assert.match(out, /## Problem/, "the body is untouched");
});

test("setList leaves a document that already says the right thing alone", () => {
  const md = "---\nid: aa\ntags: [bug, hub]\n---\n\n## Problem\nx\n";
  assert.equal(setList(md, "tags", ["bug", "hub"]), md, "publishing twice must not rewrite it");
});

test("setList appends the field when the document has none", () => {
  const out = setList("---\nid: aa\n---\n\nx\n", "tags", ["bug"]);
  assert.match(out, /^tags: \[bug\]$/m);
  assert.deepEqual(parseMeta(out).tags, ["bug"]);
});

test("an empty list is written as one, not left as the old value", () => {
  const out = setList("---\nid: aa\ntags: [bug]\n---\n\nx\n", "tags", []);
  assert.match(out, /^tags: \[\]$/m);
  assert.deepEqual(parseMeta(out).tags, []);
});

test("nothing a stranger does to your guide happens in silence", async () => {
  // Checked against the source because the Hono app is not importable from a test — see the note
  // in hosts.ts. What is pinned is the rule, not the wording: every mutation a person who is not
  // the author can reach has to tell the author. `reopened` is here because it did not, and a
  // guide moved off somebody's board on another person's say-so without a word.
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const block = (needle, len = 4000) => {
    const at = src.indexOf(needle);
    assert.ok(at > 0, `${needle} should still exist`);
    return src.slice(at, at + len);
  };
  // The verdict and the first word back live in one function each, shared by every route that
  // records them, so each function is held to the rule and each route to calling it.
  for (const [fn, kind] of [
    ["async function recordVerdict", /kind: ok \? "verified" : "failed"/],
    ["async function recordAck", /kind,/],
  ]) {
    const body = block(fn);
    assert.match(body, /await notify\(c\.env/, `${fn} must tell the author something happened`);
    assert.match(body, kind, `${fn} must tell them what`);
  }
  for (const [route, calls] of [
    ["/v1/guides/:id/verdict", /recordVerdict\(/],
    ["/v1/guides/:id/ack", /recordAck\(/],
    ["/v1/guides/:id/hand_in", /recordVerdict\(/],
    ["/v1/guides/:id/pass", /recordAck\(/],
  ])
    assert.match(block(`"${route}"`, 3000), calls, `${route} must tell the author`);
  for (const kind of [/kind: "reopened"/, /kind: "consumed"/]) {
    const body = block('"/v1/guides/:id/status"');
    assert.match(body, /await notify\(c\.env/);
    assert.match(body, kind);
  }
});

test("the inbox ranks a handle over a group over a team drop", async () => {
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const at = src.indexOf("async function inboxRows");
  const body = src.slice(at, at + 3000);
  assert.match(
    body,
    /ORDER BY CASE WHEN to_account_id = \? THEN 0 WHEN to_group_id <> '' THEN 1 ELSE 2 END/,
    "a handle chose you, a group chose the people who do a thing, a team drop chose nobody",
  );
});

test("a group address does not also land on everyone else in the team", async () => {
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const at = src.indexOf("async function inboxRows");
  const body = src.slice(at, at + 3000);
  assert.match(
    body,
    /AND to_account_id = '' AND to_group_id = ''/,
    "the team-wide clause must exclude both of the narrower addresses",
  );
  assert.match(
    body,
    /SELECT group_id FROM group_member WHERE account_id = \?/,
    "a group guide reaches the people in that group",
  );
});

test("somebody else taking it clears a shared ask, never one with your name on it", async () => {
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const at = src.indexOf("async function inboxRows");
  const body = src.slice(at, at + 3000);
  assert.match(
    body,
    /SELECT guide_id FROM ack WHERE taken = 1 AND account_id <> \?/,
    "one person answering a group is the answer for the group",
  );
  // The escape hatch beside it is the load-bearing half: without it, a teammate taking something
  // addressed to you by name would quietly clear it off your board.
  const clause = body.slice(body.indexOf("AND (to_account_id = ?"));
  assert.match(clause.slice(0, 200), /to_account_id = \?/);
});

test("what parses and what may be set are two different lists", () => {
  // `promoted` has to keep parsing: the value lives in frontmatter inside markdown in other
  // people's repositories, and validate() refuses a status it does not know — so dropping it from
  // STATUSES would stop a guide shared a month ago from re-sharing today. It must not be settable,
  // because quota.ts counts it as occupying room and a settable one is an unlimited free tier.
  assert.ok(STATUSES.includes("promoted"), "promoted must still parse");
  assert.ok(!SETTABLE.includes("promoted"), "promoted must not be settable");
  for (const s of SETTABLE) assert.ok(STATUSES.includes(s), `${s} must also parse`);
  assert.deepEqual([...SETTABLE], ["draft", "published", "consumed"]);
});

test("parseMeta reads a parent, which needs no rule of its own", () => {
  // The parser is generic, so `parent:` is read the moment the field exists in the format. This
  // pins that it stays a plain scalar — not a list, not normalised the way tags are.
  const m = parseMeta(`---\nid: k3mq2xa7\ntitle: One\nparent: zx9y8w42\n---\n\n## Problem\nx\n`);
  assert.equal(m.parent, "zx9y8w42");
  assert.equal(parseMeta(DOC).parent, undefined, "and a guide without one says nothing");
});

test("an image a reader cannot load is caught, and an ordinary one is not", () => {
  // The case that shipped: ChatGPT wrapped its own file id in a scheme it invented, and the guide
  // published with a dead picture and no upload behind it.
  assert.deepEqual(
    unreachableImages("![Teams page](attachment://file_00000000399c82119527546cfeeb8b9c)"),
    ["attachment://file_00000000399c82119527546cfeeb8b9c"],
  );
  for (const target of [
    "blob:https://chatgpt.com/abc",
    "file:///tmp/a.png",
    "data:image/png;base64,iVBOR",
  ]) {
    assert.deepEqual(unreachableImages(`![x](${target})`), [target], `${target} should be caught`);
  }
  // Left alone: an uploaded shot, an image hosted elsewhere, and a relative path that has always
  // published. This is a check for handles only one client can read, not a link checker.
  assert.deepEqual(unreachableImages("![a](https://passalong.dev/v1/shots/abc123)"), []);
  assert.deepEqual(unreachableImages("![a](http://example.com/a.png)"), []);
  assert.deepEqual(unreachableImages("![a](./diagram.png)"), []);
  // A link that is not an image is not this check's business.
  assert.deepEqual(unreachableImages("[see](attachment://file_1)"), []);
});

test("the API description covers what an agent does with a task, and not the review gate", async () => {
  const { openapi } = await import("../src/openapi.ts");
  const doc = openapi("https://passalong.dev");
  for (const [path, method] of [
    ["/v1/tasks", "get"],
    ["/v1/tasks/next", "post"],
    ["/v1/tasks/{id}/progress", "put"],
    ["/v1/tasks/{id}/finish", "post"],
  ])
    assert.ok(doc.paths[path]?.[method], `${method.toUpperCase()} ${path} is described`);
  // Approve, reject and release are a person's calls. Describing them would invite a model to make
  // them, which is the one thing the review gate exists to stop, so they stay out, like the
  // account routes do.
  for (const gate of ["approve", "reject", "release"])
    assert.equal(doc.paths[`/v1/tasks/{id}/${gate}`], undefined, `${gate} is not described`);
  // A task is answered with the task routes: ack and verdict say they refuse one.
  for (const path of ["/v1/guides/{id}/ack", "/v1/guides/{id}/verdict"])
    assert.match(doc.paths[path].put.responses[400].description, /task/i, path);
});

test("the API description says null the way OpenAPI 3.1 does", async () => {
  const { openapi } = await import("../src/openapi.ts");
  const doc = openapi("https://passalong.dev");
  assert.equal(doc.openapi.startsWith("3.1"), true);
  // `nullable` is OpenAPI 3.0. A 3.1 validator ignores it, so a field that can be null reads as one
  // that never is, and a client generated from it chokes on the null.
  assert.doesNotMatch(JSON.stringify(doc), /"nullable"/);
});
