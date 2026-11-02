import assert from "node:assert/strict";
import { test } from "node:test";
import { workIdFrom } from "../app/utils/goto.ts";

test("the id comes out of whatever was pasted", () => {
  assert.equal(workIdFrom("w45xjxw9"), "w45xjxw9");
  assert.equal(workIdFrom(" `rpqhj8hn` "), "rpqhj8hn", "an agent's backticks");
  assert.equal(workIdFrom("CE4KA9JM"), "ce4ka9jm");
  assert.equal(workIdFrom("https://passalong.dev/w/435wp367/k3y9ab?view=verify"), "435wp367");
  assert.equal(workIdFrom("https://passalong.dev/hub/w/acxa8kdu"), "acxa8kdu");
});

test("anything that is not an id is nothing", () => {
  assert.equal(workIdFrom(""), "");
  assert.equal(workIdFrom("dark mode"), "");
  assert.equal(workIdFrom("abc"), "", "too short");
  assert.equal(workIdFrom("https://passalong.dev/hub/work"), "");
});
