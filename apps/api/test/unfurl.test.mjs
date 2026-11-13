// A link's preview: which URLs may be fetched at all, what is read from a page's head, and that
// every redirect is checked again.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readOpenGraph, unfurl, unfurlTarget } from "../src/unfurl.ts";

test("only public http(s) pages on someone else's host are fetched", () => {
  assert.ok(unfurlTarget("https://github.com/a/b/pull/1"));
  assert.ok(unfurlTarget("http://example.com/x#frag"));
  assert.equal(unfurlTarget("https://example.com/x#frag").hash, "");
  for (const bad of [
    "ftp://example.com/",
    "javascript:alert(1)",
    "https://user:pass@example.com/",
    "https://example.com:8080/",
    "http://localhost/",
    "http://app.localhost/",
    "http://127.0.0.1/",
    "http://10.0.0.5/",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.1/",
    "http://172.20.0.1/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://8.8.8.8/",
    "http://intranet/",
    "https://passalong.dev/hub/w/abcd2345",
    "https://passalong.kreativekorna.com/w/x/y",
    "not a url",
  ])
    assert.equal(unfurlTarget(bad), null, bad);
  assert.equal(unfurlTarget("https://passalong.localhost/x", ["passalong.localhost"]), null);
});

test("Open Graph first, then Twitter's tags, then the title, decoded and capped", () => {
  const p = readOpenGraph(`<html><head>
    <title>Fallback &amp; title</title>
    <meta content="Fix payouts by bamiboy · Pull Request #2955" property="og:title">
    <meta property='og:description' content='Resolves the bank &#39;before&#39; save.'>
    <meta property="og:site_name" content="GitHub">
    <meta name="description" content="ignored">
  </head></html>`);
  assert.deepEqual(p, {
    title: "Fix payouts by bamiboy · Pull Request #2955",
    description: "Resolves the bank 'before' save.",
    site: "GitHub",
  });
  assert.equal(readOpenGraph("<title>  Only &lt;this&gt;  </title>").title, "Only <this>");
  assert.equal(
    readOpenGraph(`<meta property="og:title" content="${"x".repeat(500)}">`).title.length,
    200,
  );
});

test("a redirect to a private address is not followed, and a non-HTML answer is nothing", async () => {
  const seen = [];
  const fake = async (url) => {
    seen.push(url);
    if (url.startsWith("https://short.example/"))
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } });
    if (url.startsWith("https://img.example/"))
      return new Response("png", { headers: { "content-type": "image/png" } });
    return new Response('<meta property="og:title" content="Hello">', {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };
  assert.equal((await unfurl("https://short.example/a", [], fake)).title, "");
  assert.deepEqual(seen, ["https://short.example/a"]);
  assert.equal((await unfurl("https://img.example/a.png", [], fake)).title, "");
  assert.equal((await unfurl("https://ok.example/", [], fake)).title, "Hello");
});

test("a preview is read once and kept; a cached one never fetches", async () => {
  const { cachedPreview, previewOf } = await import("../src/unfurl.ts");
  const kept = new Map();
  const cache = {
    match: async (req) => kept.get(req.url)?.clone(),
    put: async (req, res) => void kept.set(req.url, res),
  };
  assert.equal(await cachedPreview("https://passalong.dev", "https://ok.example/", cache), null);
  let fetched = 0;
  globalThis.fetch = async () => {
    fetched++;
    return new Response('<meta property="og:title" content="Hello">', {
      headers: { "content-type": "text/html" },
    });
  };
  const first = await previewOf(
    "https://passalong.dev",
    "https://ok.example/",
    [],
    undefined,
    cache,
  );
  const again = await previewOf(
    "https://passalong.dev",
    "https://ok.example/",
    [],
    undefined,
    cache,
  );
  assert.equal(first.title, "Hello");
  assert.equal(again.title, "Hello");
  assert.equal(fetched, 1);
  assert.equal(
    (await cachedPreview("https://passalong.dev", "https://ok.example/", cache)).title,
    "Hello",
  );
});
