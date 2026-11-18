// A cached scripted page must leave with a fresh nonce and the policy naming it, never the stored one.
import assert from "node:assert/strict";
import test from "node:test";
import "./aliases.mjs";

const { restamp, hubHeaders } = await import("../shared/csp.ts");

test("every script's stored nonce is swapped for one fresh nonce the policy names", () => {
  const stored =
    '<script nonce="OLD+/=" type="module" src="/a.js"></script><script nonce="OLD+/=">x</script>';
  const { body, nonce } = restamp(stored);
  assert.ok(nonce && nonce !== "OLD+/=");
  assert.equal(body.includes("OLD+/="), false);
  assert.equal(body.split(`nonce="${nonce}"`).length, 3);
  assert.match(
    hubHeaders(nonce)["content-security-policy"],
    new RegExp(`'nonce-${nonce.replace(/[+/=]/g, "\\$&")}'`),
  );
});

test("a page with no script is left alone, so its strict route-rule policy stands", () => {
  const stored = '<p>hi</p><script type="application/ld+json">{}</script>';
  assert.deepEqual(restamp(stored), { body: stored });
});

test("two hits never share a nonce", () => {
  const stored = '<script nonce="OLD">x</script>';
  assert.notEqual(restamp(stored).nonce, restamp(stored).nonce);
});
