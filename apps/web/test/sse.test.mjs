// Reading /v1/events in the hub (utils/sse.ts): events split across chunks, comments, ids.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sseParser } from "../app/utils/sse.ts";

test("an event split across chunks comes out whole, once", () => {
  const feed = sseParser();
  assert.deepEqual(feed("id: 1\nevent: no"), []);
  assert.deepEqual(feed('te\ndata: {"a":1}\n'), []);
  assert.deepEqual(feed("\n"), [{ event: "note", id: "1", data: '{"a":1}' }]);
});

test("comments, retry lines and heartbeats are not events", () => {
  const feed = sseParser();
  assert.deepEqual(feed("retry: 2000\n\n: ping\n\nevent: change\ndata: x\n\n"), [
    { event: "change", id: "", data: "x" },
  ]);
});

test("CRLF line endings read the same", () => {
  const feed = sseParser();
  assert.deepEqual(feed("event: ready\r\ndata: y\r\n\r\n"), [
    { event: "ready", id: "", data: "y" },
  ]);
});
