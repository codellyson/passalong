// Answering an agent from the work page. The server always took replies (POST /v1/work/:id/reply,
// handed to the agent on its next progress or take), and the hub's conversation panel had the box —
// but nothing on the work page opened it, so progress could be read and never answered.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(new URL("../app/pages/hub/w/[id].vue", import.meta.url), "utf8");

test("Progress ends in Reply, or Leave a note, only where the server says this reader may write", () => {
  assert.match(
    page,
    /<div v-if="ctx\.reply" class="[^"]*border-t[^"]*">/,
    "offered only when allowed",
  );
  assert.match(page, /ctx\.reply === "message" \? "Reply" : "Leave a note"/);
  assert.match(page, /@click="respond"/);
});

test("it opens the conversation, its box for a message or a note", () => {
  const fn = page.slice(page.indexOf("function respond()"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /thread\.open\(\{/);
  assert.match(body, /reply: true,/);
  assert.match(body, /noting: ctx\.value\.reply === "note",/);
});
