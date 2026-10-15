import assert from "node:assert/strict";
import { test } from "node:test";
import { guideIdFrom } from "../app/utils/goto.ts";

test("the id comes out of whatever was pasted", () => {
  assert.equal(guideIdFrom("w45xjxw9"), "w45xjxw9");
  assert.equal(guideIdFrom(" `rpqhj8hn` "), "rpqhj8hn", "an agent's backticks");
  assert.equal(guideIdFrom("CE4KA9JM"), "ce4ka9jm");
  assert.equal(guideIdFrom("https://passalong.dev/g/435wp367/k3y9ab?view=verify"), "435wp367");
  assert.equal(guideIdFrom("https://passalong.dev/hub/g/acxa8kdu"), "acxa8kdu");
});

test("anything that is not an id is nothing", () => {
  assert.equal(guideIdFrom(""), "");
  assert.equal(guideIdFrom("dark mode"), "");
  assert.equal(guideIdFrom("abc"), "", "too short");
  assert.equal(guideIdFrom("https://passalong.dev/hub/work"), "");
});
