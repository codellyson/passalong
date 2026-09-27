// The live event stream (src/events.ts), driven by a fake clock and a fake source.
import assert from "node:assert/strict";
import { test } from "node:test";
import { eventStream, startAt } from "../src/events.ts";

const T = (s) => `2026-09-27T10:00:${String(s).padStart(2, "0")}.000Z`;

/** A clock that only moves when the stream sleeps. */
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => void (t += ms) };
}

async function read(stream) {
  const dec = new TextDecoder();
  let out = "";
  for await (const chunk of stream) out += dec.decode(chunk);
  return out;
}

/** Parsed SSE frames, comments and retry lines left out. */
const frames = (text) =>
  text
    .split("\n\n")
    .filter((b) => b.includes("event:"))
    .map((b) => {
      const f = {};
      for (const line of b.split("\n")) {
        const [k, ...v] = line.split(": ");
        f[k] = v.join(": ");
      }
      return { event: f.event, id: f.id, data: JSON.parse(f.data) };
    });

test("notes and changes go out in time order, each carrying the cursor it moved to", async () => {
  let served = false;
  const source = {
    notes: async () => (served ? [] : [{ id: 7, at: T(5), text: "Bo took it" }]),
    changes: async () => {
      if (served) return [];
      served = true;
      return [{ guide_id: "g1", at: T(3) }];
    },
  };
  const got = frames(
    await read(eventStream(source, T(0), { clock: fakeClock(), lifetime: 10_000 })),
  );
  assert.deepEqual(
    got.map((f) => [f.event, f.id]),
    [
      ["ready", T(0)],
      ["change", T(3)],
      ["note", T(5)],
    ],
  );
  assert.equal(got[2].data.text, "Bo took it");
});

test("each read asks only for what came after the last thing sent", async () => {
  const asked = [];
  let n = 0;
  const source = {
    notes: async (since) => {
      asked.push(since);
      n++;
      return n === 1 ? [{ id: 1, at: T(4) }] : [];
    },
    changes: async () => [],
  };
  await read(eventStream(source, T(0), { clock: fakeClock(), tick: 1000, lifetime: 3000 }));
  assert.deepEqual(asked, [T(0), T(4), T(4)]);
});

test("a quiet connection is kept open with a heartbeat, and ends when its lifetime is up", async () => {
  const source = { notes: async () => [], changes: async () => [] };
  const text = await read(
    eventStream(source, T(0), { clock: fakeClock(), tick: 1000, heartbeat: 2000, lifetime: 5000 }),
  );
  assert.ok(text.includes(": ping"), "a heartbeat comment was sent");
  assert.ok(text.startsWith("retry: 2000"), "the client is told how soon to reconnect");
});

test("it stops as soon as the client goes", async () => {
  const ctl = new AbortController();
  let reads = 0;
  const source = {
    notes: async () => {
      reads++;
      if (reads === 2) ctl.abort();
      return [];
    },
    changes: async () => [],
  };
  await read(
    eventStream(source, T(0), { clock: fakeClock(), signal: ctl.signal, lifetime: 60_000 }),
  );
  assert.equal(reads, 2);
});

test("a failed read ends the connection instead of throwing into the response", async () => {
  const source = {
    notes: async () => {
      throw new Error("D1 hiccup");
    },
    changes: async () => [],
  };
  const got = frames(await read(eventStream(source, T(0), { clock: fakeClock() })));
  assert.deepEqual(
    got.map((f) => f.event),
    ["ready"],
  );
});

test("a reconnect resumes from the cursor it was given, and a fresh one starts now", () => {
  assert.equal(startAt(T(9)), T(9));
  const now = new Date("2026-09-27T12:00:00.000Z");
  assert.equal(startAt(undefined, now), now.toISOString());
  assert.equal(startAt("not a time", now), now.toISOString());
});
