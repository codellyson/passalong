// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  body,
  dropField,
  parseMeta,
  SETTABLE,
  STATUSES,
  setField,
  setList,
  shotIds,
  split,
  tag,
  tagList,
  taskPublishProblem,
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
  // A kind as well, on this path too: a document with no frontmatter returns early, and the two
  // parsers have to leave it in the same state there. The shared corpus caught them disagreeing
  // about exactly this.
  //
  // Empty, not "transfer". A silent default told 162 of 200 real guides they were transfers when
  // their titles were tasks and bug reports — while publish_guide's own description promised
  // "kind: task (the default)". Absent is now absent, and validate() refuses it by name.
  assert.deepEqual(parseMeta("no frontmatter"), {
    tags: [],
    stack_assumptions: [],
    kind: "",
  });
});

test("a task enters the queue only after a separate Ready action", () => {
  assert.match(taskPublishProblem("task", "published"), /must be Draft/);
  assert.match(taskPublishProblem("task", "consumed"), /must be Draft/);
  assert.match(taskPublishProblem("task", "published", "draft"), /separate action/);
  assert.match(taskPublishProblem("task", "published", "consumed"), /separate action/);
  assert.equal(taskPublishProblem("task", "draft"), "");
  assert.equal(taskPublishProblem("task", "published", "published"), "");
  assert.equal(taskPublishProblem("bug", "published"), "");
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

test("a correction is a verdict with room, shown on the guide", async () => {
  // The page never rendered a verdict, so a guide somebody had already found broken still read as
  // authoritative to the next reader — and `note` is capped at 280 characters, the width of the
  // row it was written for. Between them, the only way to warn anyone was to publish a second
  // guide titled "Correction: …" and hope they followed the link.
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const at = src.indexOf("async function recordVerdict");
  const fn = src.slice(at, at + 1400);
  assert.match(fn, /detail = ""/, "a verdict carries why, at the length that takes");
  assert.match(fn, /checks = ""/, "sorted against the line each part answers");
  assert.match(fn, /INSERT INTO verdict[\s\S]*detail, checks/, "and stores both");

  // A failing hand-in already collected the evidence; it lands on the verdict now, not only the
  // claim, which is what makes the guide able to show it.
  const handIn = src.slice(src.indexOf('app.post("/v1/guides/:id/hand_in"'));
  const route = handIn.slice(0, handIn.indexOf("\napp."));
  assert.match(route, /claims\.handIn\([\s\S]*evidence,[\s\S]*verdict: \{ ok: who\.ok \}/);
  const claims = await readFile(new URL("../src/claims.ts", import.meta.url), "utf8");
  assert.match(claims, /INSERT INTO verdict[\s\S]*detail, checks, writeup/);

  // And the page asks for them. Without this the rest is a column nobody reads.
  const page = await readFile(
    new URL("../../web/server/api/guide/[id]/[key].get.ts", import.meta.url),
    "utf8",
  );
  assert.match(page, /FROM verdict\s*\n\s*WHERE guide_id = \? AND ok = 0/, "only the failures");
  assert.doesNotMatch(
    page,
    /SELECT[^;]*account_id[^;]*FROM verdict/,
    "and nobody is named: the key in the URL is the whole authorisation, so this page is public",
  );
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
    assert.match(block(`"${route}"`, 4000), calls, `${route} must tell the author`);
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
    ["/v1/take", "post"],
    ["/v1/guides/{id}/progress", "put"],
    ["/v1/guides/{id}/hand_in", "post"],
    ["/v1/guides/{id}/pass", "post"],
    ["/v1/guides/{id}/ask", "post"],
    ["/v1/guides/{id}/reply", "post"],
    ["/v1/working", "get"],
    ["/v1/guides/{id}/assign", "post"],
  ])
    assert.ok(doc.paths[path]?.[method], `${method.toUpperCase()} ${path} is described`);
  // Every verb's answer says what to call next; a client generated from the spec should see it.
  assert.ok(doc.components.schemas.Next, "the next-step shape is described");
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

test("a field can be taken out of the frontmatter, and nothing else moves", () => {
  const md = '---\nid: aa\nteam: khaime\nto: "@ada"\ntitle: t\n---\n\nbody\n';
  assert.equal(dropField(md, "to"), "---\nid: aa\nteam: khaime\ntitle: t\n---\n\nbody\n");
  assert.equal(dropField(md, "missing"), md, "absent is a no-op");
  assert.equal(parseMeta(dropField(md, "to")).to, undefined);
});

test("a guide that worked with changes says so, on itself", async () => {
  // The other half of the correction channel, and the last thing an agent had to publish a guide
  // to say. A hand-in that HELD, and had to adapt something to get there, had `ok` (a boolean),
  // `note` (280 characters) and `evidence` (what you ran). So the adaptation arrived as a
  // follow-up guide — "The email step needs MAIL_FROM and the R2 bucket name" — with an id, a
  // share link and an inbox row asking somebody to take it, when it is a paragraph about a guide.
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const handIn = src.slice(src.indexOf('app.post("/v1/guides/:id/hand_in"'));
  const route = handIn.slice(0, handIn.indexOf("\napp."));
  assert.match(route, /claims\.handIn\([\s\S]*writeup,[\s\S]*verdict: \{ ok: who\.ok \}/);
  assert.match(route, /claims\.handIn\([\s\S]*writeup,/, "and the claim, for the author's row");

  // A later hand-in with nothing to add must not erase what an earlier one wrote: a verdict is one
  // row per account, and silence is not a retraction.
  const at = src.indexOf("async function recordVerdict");
  const fn = src.slice(at, at + 1400);
  assert.match(fn, /writeup = CASE WHEN excluded\.writeup <> ''/);

  const page = await readFile(
    new URL("../../web/server/api/guide/[id]/[key].get.ts", import.meta.url),
    "utf8",
  );
  // Its own query, not one over both: a guide with five write-ups must never push a "this did not
  // hold" off the list the reader is warned by.
  assert.match(page, /WHERE guide_id = \? AND ok = 1 AND \(writeup <> '' OR checks <> ''\)/);
  assert.match(
    page,
    /FROM verdict\s*\n\s*WHERE guide_id = \? AND ok = 0/,
    "the warning still stands alone",
  );
  assert.doesNotMatch(
    page,
    /SELECT[^;]*account_id[^;]*FROM verdict/,
    "and nobody is named: the key in the URL is the whole authorisation, so this page is public",
  );
});

test("what ran outranks what was said about it, on the guide", async () => {
  // The page showed a passing hand-in's `writeup` — prose nothing checked — at the top, above the
  // guide it is about, and did not show that hand-in's `checks` at all. The executed commands, the
  // one thing on the page the agent could not have written, were only in the author's hub row. So
  // the surface gave its best position to its weakest evidence.
  const page = await readFile(
    new URL("../../web/server/api/guide/[id]/[key].get.ts", import.meta.url),
    "utf8",
  );
  assert.match(page, /SELECT writeup, checks, at FROM verdict/, "the page asks for both");
  // A check the runner executed carries `cmd` and an `exit`; one with only `ran` is the agent's
  // account. They are separated here, not merged into a count of "evidence".
  assert.match(page, /ran: rows\.filter\(verified\)/);
  assert.match(page, /said: rows\.filter\(\(c\) => !verified\(c\)\)/);
  assert.match(page, /\.sort\(\(a, b\) => b\.ran\.length - a\.ran\.length\)/, "run evidence first");

  const view = await readFile(
    new URL("../../web/app/pages/g/[id]/[key].vue", import.meta.url),
    "utf8",
  );
  // Order in the markup is the ranking a reader actually meets.
  const at = (needle) => {
    const i = view.indexOf(needle);
    assert.ok(i > 0, `${needle} should be on the page`);
    return i;
  };
  assert.ok(at("a.ran") < at("a.said"), "executed commands before the agent's account of them");
  assert.ok(at("a.said") < at("a.writeup"), "and both before prose");
  assert.match(view, /What they said they changed/, "prose is labelled as what it is");
});

test("a hand-in says what it did in a sentence, before anything behind it is read", async () => {
  // The route is not importable from a test (see hosts.ts), so the rule is pinned in the source:
  // `note` is refused when empty and the refusal comes before either kind's branch runs.
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const at = src.indexOf('app.post("/v1/guides/:id/hand_in"');
  const route = src.slice(at, src.indexOf("\napp.", at));
  const refusal = route.indexOf("if (!note) return err(c, 400");
  assert.ok(refusal > 0, "an empty note is refused");
  assert.ok(refusal < route.indexOf('found.row.kind === "task"'), "for a task and a handoff alike");
  // The legacy finish route stays lenient: an installed CLI still calls it and sends none, and the
  // thread has a plain sentence for a hand-in with no words of its own.
  const finish = src.slice(src.indexOf('app.post("/v1/tasks/:id/finish"'));
  assert.doesNotMatch(finish.slice(0, finish.indexOf("\napp.")), /if \(!note\)/);
});

test("a question and a reply each tell the person waiting on them", async () => {
  // Pinned in the source for the reason the test above is: the Hono app is not importable here. An
  // agent that asks and a person who answers are each waiting on the other, and neither can see
  // that the other has spoken unless something says so.
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const block = (needle) => {
    const at = src.indexOf(needle);
    assert.ok(at > 0, `${needle} should still exist`);
    return src.slice(at, src.indexOf("\napp.", at + 10));
  };
  assert.match(block('"/v1/guides/:id/ask"'), /kind: "asked"[\s\S]*sendAsked\(/);
  assert.match(block('"/v1/guides/:id/reply"'), /kind: "replied"[\s\S]*sendReplied\(/);
});

test("a new guide says what it is to a person, and an old one is let through as it came", async () => {
  const { summaryProblem, SUMMARY_MAX, parseMeta } = await import("../src/guide.ts");
  assert.equal(summaryProblem("What this is, for a person."), null);
  assert.match(summaryProblem(""), /say it to a person/, "refused by name");
  assert.match(summaryProblem(undefined), /summary/);
  assert.match(summaryProblem("x".repeat(SUMMARY_MAX + 1)), /400 at most/);
  assert.equal(summaryProblem("x".repeat(SUMMARY_MAX)), null);
  // A guide stored before summaries existed, written again by a client that has not heard of them,
  // is not refused for a field it cannot know about. A guide that never had one is.
  assert.equal(summaryProblem("", true), null);
  assert.match(summaryProblem("", false), /summary/);
  // And a summary is held to the limit even where an absent one is forgiven.
  assert.match(summaryProblem("x".repeat(SUMMARY_MAX + 1), true), /400 at most/);
  assert.equal(
    parseMeta("---\ntitle: t\nsummary: Said plainly.\nkind: task\n---\n").summary,
    "Said plainly.",
  );

  // The route refuses before it stores, and stores what it kept.
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const at = src.indexOf("summaryProblem(meta.summary");
  assert.ok(at > 0, "the publish refuses a guide with no summary");
  assert.ok(
    at < src.indexOf("INSERT INTO guide (id, account_id, share_key"),
    "before anything is written",
  );
  assert.match(src, /summary=excluded\.summary/);
});
