// Changing your email in Settings to one another account has. Addresses are unique (account_email),
// so the UPDATE threw and the person saw a server error rather than why (2026-11-05).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("a taken email is refused with a reason before it is written", () => {
  const route = index.slice(index.indexOf('app.patch("/v1/me"'));
  const body = route.slice(0, route.indexOf("\n});"));
  const check = body.indexOf("SELECT id FROM account WHERE email = ? AND id <> ?");
  assert.ok(check > 0, "it asks who else has it");
  assert.ok(check < body.indexOf("UPDATE account SET"), "before writing");
  assert.match(body, /409,\s*"Another account already uses that email\./);
});
