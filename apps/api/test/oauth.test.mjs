// The parts of the OAuth server where being wrong is a security bug rather than a bug.
//
// The flow itself is exercised against a deployed server; these are the primitives underneath it,
// which are exactly the pieces that look right when they are not.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authorizationServerMetadata,
  pkceMatches,
  protectedResourceMetadata,
  redirectAllowed,
  timingSafeEqual,
} from "../src/oauth.ts";

test("PKCE accepts the verifier that made the challenge, and nothing else", async () => {
  // The known-answer pair from RFC 7636 appendix B. If this passes, the encoding is right:
  // SHA-256, base64url, unpadded — a padded or base64-standard digest silently never matches.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  assert.equal(await pkceMatches(verifier, challenge), true);

  assert.equal(await pkceMatches(`${verifier}x`, challenge), false);
  assert.equal(await pkceMatches("", challenge), false);
  assert.equal(await pkceMatches(verifier, ""), false);
  // The plain challenge must not be accepted where S256 is expected: it proves nothing.
  assert.equal(await pkceMatches(verifier, verifier), false);
});

test("a redirect_uri must be the registered one, exactly", () => {
  const registered = "https://chatgpt.com/connector/oauth/Nh47m8JRMDUk";
  assert.equal(redirectAllowed(registered, registered), true);
  // Omitted is allowed — the registered one is then used — but anything else is not.
  assert.equal(redirectAllowed(registered, undefined), true);

  for (const attacker of [
    "https://chatgpt.com/connector/oauth/Nh47m8JRMDUk/../../evil",
    "https://chatgpt.com/connector/oauth/Nh47m8JRMDUkx",
    "https://chatgpt.com.evil.test/connector/oauth/Nh47m8JRMDUk",
    "https://chatgpt.com/connector/oauth/",
    "http://chatgpt.com/connector/oauth/Nh47m8JRMDUk",
    `${registered}?next=https://evil.test`,
  ]) {
    assert.equal(redirectAllowed(registered, attacker), false, `must refuse ${attacker}`);
  }
});

test("comparison does not stop at the first wrong character", () => {
  assert.equal(timingSafeEqual("abcdef", "abcdef"), true);
  assert.equal(timingSafeEqual("abcdef", "abcdeg"), false);
  assert.equal(timingSafeEqual("abcdef", "abcde"), false);
  assert.equal(timingSafeEqual("", ""), true);
});

test("discovery says only what this server actually supports", async () => {
  const meta = authorizationServerMetadata("https://passalong.dev");
  assert.equal(meta.issuer, "https://passalong.dev");
  assert.equal(meta.authorization_endpoint, "https://passalong.dev/oauth/authorize");
  // This assertion encoded the bug rather than catching it: it asserted the URL the metadata
  // claimed instead of the URL the route is served at, and production answered 404. Both endpoints
  // are checked against the paths in index.ts now.
  assert.equal(meta.token_endpoint, "https://passalong.dev/v1/oauth/token");
  assert.equal(meta.revocation_endpoint, "https://passalong.dev/v1/oauth/revoke");
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  for (const endpoint of [meta.token_endpoint, meta.revocation_endpoint]) {
    const path = endpoint.replace("https://passalong.dev", "");
    assert.ok(src.includes(`app.post("${path}"`), `nothing serves ${path}`);
  }
  assert.ok(src.includes('app.get("/oauth/authorize"'), "nothing serves the authorize endpoint");
  // S256 only. Advertising `plain` would invite a client to use it, and it protects nothing.
  assert.deepEqual(meta.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(meta.response_types_supported, ["code"]);
  assert.ok(!meta.grant_types_supported.includes("implicit"));
  assert.ok(!meta.grant_types_supported.includes("password"));

  const resource = protectedResourceMetadata("https://passalong.dev");
  assert.equal(resource.resource, "https://passalong.dev/v1/mcp");
  assert.deepEqual(resource.authorization_servers, ["https://passalong.dev"]);
  assert.deepEqual(resource.scopes_supported, ["mcp"]);
});

test("only a signed-in person can approve a connector", async () => {
  // Checked against the source because the app is not importable from a test. The middleware
  // accepts an API token or a session cookie, so `c.get("account")` alone would let a token mint a
  // connector grant — a credential creating a longer-lived credential, which is exactly what a
  // consent flow is for.
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const approve = src.slice(src.indexOf('app.post("/v1/oauth/approve"'));
  const handler = approve.slice(0, approve.indexOf("\napp."));
  assert.match(handler, /readCookie\(c\.req\.header\("cookie"\), SESSION_COOKIE\)/);
  assert.ok(
    handler.indexOf("SESSION_COOKIE") < handler.indexOf('c.get("account")'),
    "the session check must come before the account is trusted",
  );
});

test("the app's own dispatch is marked by something that cannot be sent", async () => {
  // Source-checked, since the app is not importable. What matters is the *kind* of marker: a
  // header saying "this is internal" would be a header anyone can send, which would turn the MCP
  // tools' dispatch into a way to skip authentication entirely.
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.match(src, /const INTERNAL = Symbol\(/, "the marker must be a symbol");
  assert.ok(
    !/Symbol\.for\(/.test(src),
    "not the global registry — anything can look a symbol up in there",
  );

  // The check has to come before the credential branches, or an OAuth token's scope check refuses
  // the tools' own calls, which is the bug this fixes.
  const middleware = src.slice(src.indexOf('app.use("/v1/*"'));
  const handler = middleware.slice(0, middleware.indexOf("\napp."));
  assert.ok(
    handler.indexOf("INTERNAL") < handler.indexOf("PUBLIC.has"),
    "the internal check must be first",
  );

  // And the inner request must not carry the caller's credential: it is not a new request from
  // them, and forwarding it is what re-triggered the scope check.
  const mcp = src.slice(src.indexOf('app.all("/v1/mcp"'));
  const route = mcp.slice(0, mcp.indexOf("\napp."));
  assert.match(route, /asAccount\(/);
  assert.ok(!/authorization/.test(route), "the tools' dispatch must not forward a credential");
});
