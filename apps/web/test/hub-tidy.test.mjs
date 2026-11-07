// Small things the walkthrough found that add up (2026-11-07).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../app/${p}`, import.meta.url), "utf8");

test("Needs you lists finished work once, in Closed by the agent", () => {
  const page = read("pages/hub/index.vue");
  assert.doesNotMatch(page, /Closed in the last day/);
  assert.match(page, /Closed by the agent/);
});

test("the email banner asks on Needs you, not on every page", () => {
  assert.match(
    read("components/hub/Shell.vue"),
    /route\.path === "\/hub" \|\| verifiedFrom\.value === "expired"/,
  );
});

test("By person's columns share the width before they scroll, so Done is on screen", () => {
  const board = read("components/hub/Board.vue");
  assert.match(board, /md:min-w-\[14rem\] md:flex-1/);
  assert.doesNotMatch(board, /md:w-\[17rem\]/);
});
