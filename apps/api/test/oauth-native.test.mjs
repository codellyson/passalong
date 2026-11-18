// Desktop apps that sign in through their own URL scheme: allowed by exact string, nothing looser.
import assert from "node:assert/strict";
import { test } from "node:test";
import { redirectUriProblem, validateRegistration } from "../src/oauth.ts";

const CURSOR = "cursor://anysphere.cursor-mcp/oauth/callback";

test("Cursor's own callback can be registered", () => {
  assert.equal(redirectUriProblem(CURSOR), null);
});

// Cursor registers its scheme beside a loopback address in one request; refusing one refused both.
test("Cursor's registration, as it sends it, is accepted whole", () => {
  const result = validateRegistration({
    client_name: "Cursor",
    redirect_uris: [CURSOR, "http://localhost:8787/callback"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
  assert.equal(result.ok, true);
});

test("anything but the exact string is still refused", () => {
  for (const uri of [
    "cursor://anysphere.cursor-mcp/oauth/callback/extra",
    "cursor://anysphere.cursor-mcp/oauth/callback?x=1",
    "cursor://evil.example/oauth/callback",
    "CURSOR://anysphere.cursor-mcp/oauth/callback",
    "myapp://callback",
    "javascript:alert(1)",
  ]) {
    assert.notEqual(redirectUriProblem(uri), null, uri);
  }
});
