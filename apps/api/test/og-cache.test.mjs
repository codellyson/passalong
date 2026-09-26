// The unfurl card cache (`cached` in og.ts), against an in-memory stand-in for the edge cache.
//
// What it must hold: a card is drawn once per markup, a changed card is a new key rather than a
// stale picture, a failed render is never stored, the share key never reaches the cache key, and
// with no cache at all (nuxt dev, Node) it simply renders.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cached } from "../src/og.ts";

function fakeCache() {
  const store = new Map();
  return {
    store,
    match: async (req) => store.get(req.url)?.clone(),
    put: async (req, res) => {
      store.set(req.url, res);
    },
  };
}

const png = (body = "png") =>
  new Response(body, { status: 200, headers: { "content-type": "image/png" } });
const BASE = "https://passalong.dev/g/abcd2345/secretsharekey0000000/og.png";

test("the same card is drawn once and then served from the cache", async () => {
  const cards = fakeCache();
  let drawn = 0;
  const render = async () => (drawn++, png());
  const first = await cached(BASE, "<div>A</div>", render, undefined, cards);
  const second = await cached(BASE, "<div>A</div>", render, undefined, cards);
  assert.equal(drawn, 1);
  assert.equal(await first.text(), "png");
  assert.equal(await second.text(), "png");
});

test("a changed card is a new key, never a stale picture", async () => {
  const cards = fakeCache();
  let drawn = 0;
  const render = async () => (drawn++, png());
  await cached(BASE, "<div>Old title</div>", render, undefined, cards);
  await cached(BASE, "<div>New title</div>", render, undefined, cards);
  assert.equal(drawn, 2);
  assert.equal(cards.store.size, 2);
});

test("the share key is not in the cache key", async () => {
  const cards = fakeCache();
  await cached(BASE, "<div>A</div>", async () => png(), undefined, cards);
  const [key] = cards.store.keys();
  assert.match(key, /^https:\/\/passalong\.dev\/__og\/[0-9a-f]{32}\.png$/);
  assert.ok(!key.includes("secretsharekey"));
});

test("a failed render is passed through and never stored", async () => {
  const cards = fakeCache();
  const res = await cached(
    BASE,
    "<div>A</div>",
    async () => new Response("no", { status: 500 }),
    undefined,
    cards,
  );
  assert.equal(res.status, 500);
  assert.equal(cards.store.size, 0);
});

test("storing goes through waitUntil when there is one", async () => {
  const cards = fakeCache();
  const waited = [];
  await cached(
    BASE,
    "<div>A</div>",
    async () => png(),
    (p) => waited.push(p),
    cards,
  );
  assert.equal(waited.length, 1);
  await waited[0];
  assert.equal(cards.store.size, 1);
});

test("with no cache it just renders", async () => {
  let drawn = 0;
  const res = await cached(BASE, "<div>A</div>", async () => (drawn++, png()), undefined, null);
  assert.equal(drawn, 1);
  assert.equal(res.status, 200);
});
