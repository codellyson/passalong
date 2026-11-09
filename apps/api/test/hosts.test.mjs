// The www host resolves but never serves; the apex and the legacy host both do.
import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalRedirect } from "../src/hosts.ts";

test("www is sent to the apex, path and query intact", () => {
  assert.equal(
    canonicalRedirect("https://www.passalong.dev/w/abcdefgh/key123?view=verify"),
    "https://passalong.dev/w/abcdefgh/key123?view=verify",
  );
  assert.equal(canonicalRedirect("https://www.passalong.dev/"), "https://passalong.dev/");
});

test("the formatter's host keeps its page and files, and sends the rest to the apex", () => {
  for (const path of ["/", "/theme?to=dark", "/_nuxt/entry.js", "/fonts/a.woff2", "/favicon.ico"])
    assert.equal(canonicalRedirect(`https://json.passalong.dev${path}`), null, path);
  for (const path of ["/hub", "/v1/me", "/w/abcdefgh/key123", "/w/abcdefgh/key123.md"])
    assert.equal(
      canonicalRedirect(`https://json.passalong.dev${path}`),
      `https://passalong.dev${path}`,
      path,
    );
  assert.equal(
    canonicalRedirect("http://json.localhost:3004/hub?x=1"),
    "http://localhost:3004/hub?x=1",
  );
  assert.equal(
    canonicalRedirect("http://json.passalong.dev/", "json.passalong.dev", "http"),
    "https://json.passalong.dev/",
  );
});

test("the formatter has one address, and no redirect loops back", () => {
  const home = "https://json.passalong.dev/";
  assert.equal(canonicalRedirect("https://passalong.dev/json"), home);
  assert.equal(canonicalRedirect("https://passalong.kreativekorna.com/json"), home);
  assert.equal(canonicalRedirect("https://json.passalong.dev/json"), home);
  assert.equal(canonicalRedirect(home), null);
  assert.equal(canonicalRedirect("http://json.localhost:3004/json"), "http://json.localhost:3004/");
  assert.equal(canonicalRedirect("http://localhost:3004/json"), null);
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
    "https://passalong.kreativekorna.com/w/abcdefgh/key123",
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
      "http://internal.example/w/abcdefgh/key123",
      "passalong.kreativekorna.com",
      "http",
    ),
    "https://passalong.kreativekorna.com/w/abcdefgh/key123",
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

// ---- what links are minted against --------------------------------------------------------

test("a production request mints links on the apex, whichever host it arrived at", async () => {
  const { mintOrigin } = await import("../src/hosts.ts");
  const apex = "https://passalong.dev";
  assert.equal(mintOrigin(apex, "https://passalong.dev/v1/shots"), apex);
  assert.equal(mintOrigin(apex, "https://passalong.kreativekorna.com/v1/shots"), apex);
  assert.equal(mintOrigin(apex, "https://passalong-web.codellyson.workers.dev/v1/x"), apex);
});

test("a development server mints its own address, so a local upload is a local link", async () => {
  const { mintOrigin } = await import("../src/hosts.ts");
  const apex = "https://passalong.dev";
  assert.equal(mintOrigin(apex, "http://localhost:3000/v1/shots"), "http://localhost:3000");
  assert.equal(mintOrigin(apex, "http://127.0.0.1:8787/v1/shots"), "http://127.0.0.1:8787");
  assert.equal(mintOrigin(apex, "http://[::1]:3000/v1/shots"), "http://[::1]:3000");
  assert.equal(
    mintOrigin(apex, "http://passalong.localhost:3000/x"),
    "http://passalong.localhost:3000",
  );
});

test("with no public origin set, the request's own origin is used", async () => {
  const { mintOrigin } = await import("../src/hosts.ts");
  assert.equal(mintOrigin(undefined, "https://example.org/v1/x"), "https://example.org");
});
