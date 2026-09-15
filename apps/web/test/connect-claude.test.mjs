// /connect has said three untrue things about connecting an assistant, and each one outlived the
// change that made it untrue. These pin the parts that are checkable: the callback a Claude
// connector is created with, and the claims that went stale.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const connect = read("../app/pages/connect.vue");
// The connector form's per-app requirements live in utils/connect-apps.ts, callback included.
const form = read("../app/utils/connect-apps.ts");
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

test("the page and the form offer the same Claude callback", () => {
  // Exact-matched at authorize, so a one-character difference between the two is a connector that
  // is created fine and then refuses every sign-in.
  assert.ok(connect.includes(CALLBACK), "/connect names Claude's callback");
  assert.ok(form.includes(CALLBACK), "the connector form offers it");
});

test("the page does not say OAuth clients cannot connect", () => {
  assert.doesNotMatch(connect, /does not run an OAuth flow/);
  assert.doesNotMatch(connect, /cannot connect yet/);
});

test("the tools are described, not counted", () => {
  // "nine tools" was right once and then quietly wrong for every release that added one.
  assert.doesNotMatch(
    connect,
    /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) tools\b/i,
  );
});
