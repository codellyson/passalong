// The www host resolves but never serves; the apex and the legacy host both do.
import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalRedirect } from "../src/hosts.ts";

test("www is sent to the apex, path and query intact", () => {
  assert.equal(
    canonicalRedirect("https://www.passalong.dev/g/abcdefgh/key123?view=verify"),
    "https://passalong.dev/g/abcdefgh/key123?view=verify",
  );
  assert.equal(canonicalRedirect("https://www.passalong.dev/"), "https://passalong.dev/");
});

test("the Host header is enough on its own, port and all", () => {
  // What Cloudflare delivers; the URL alone is what a synthetic Request carries.
  assert.equal(
    canonicalRedirect("https://internal.example/hub", "www.passalong.dev:443"),
    "https://passalong.dev/hub",
  );
});

test("hosts that serve are left alone", () => {
  for (const url of [
    "https://passalong.dev/health",
    "https://passalong.kreativekorna.com/g/abcdefgh/key123",
    "http://localhost:8787/hub",
  ]) {
    assert.equal(canonicalRedirect(url), null, url);
  }
});

test("plain http on a serving host is upgraded, and stays on its host", () => {
  assert.equal(
    canonicalRedirect("http://passalong.dev/connect?x=1", "passalong.dev", "http"),
    "https://passalong.dev/connect?x=1",
  );
  assert.equal(
    canonicalRedirect(
      "http://internal.example/g/abcdefgh/key123",
      "passalong.kreativekorna.com",
      "http",
    ),
    "https://passalong.kreativekorna.com/g/abcdefgh/key123",
  );
  // www goes straight to the https apex rather than taking two hops.
  assert.equal(
    canonicalRedirect("http://www.passalong.dev/", "www.passalong.dev", "http"),
    "https://passalong.dev/",
  );
});

test("the scheme is only believed from the header, so nothing loops", () => {
  // A runtime that rebuilt the URL as http: must not redirect an https visitor to themselves.
  assert.equal(canonicalRedirect("http://passalong.dev/", "passalong.dev"), null);
  assert.equal(canonicalRedirect("http://passalong.dev/", "passalong.dev", "https"), null);
  // Local development is http and is never upgraded.
  assert.equal(canonicalRedirect("http://localhost:3000/", "localhost:3000", "http"), null);
});

test("a lookalike host is not mistaken for www", () => {
  assert.equal(canonicalRedirect("https://www.passalong.dev.evil.test/hub"), null);
});
