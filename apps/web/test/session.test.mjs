import assert from "node:assert/strict";
import { test } from "node:test";
import { hasSession } from "../app/utils/session.ts";

test("a request carries a session when pa_session has a value", () => {
  assert.equal(hasSession("pa_session=abc123"), true);
  assert.equal(hasSession("theme=dark; pa_session=abc123; other=1"), true);
  assert.equal(hasSession(" pa_session=a=b "), true);
});

test("it does not when the cookie is absent, empty, or only looks like it", () => {
  assert.equal(hasSession(undefined), false);
  assert.equal(hasSession(""), false);
  assert.equal(hasSession("pa_session="), false, "a cleared cookie is empty");
  assert.equal(hasSession("not_pa_session=abc"), false);
  assert.equal(hasSession("pa_session_old=abc"), false);
});
