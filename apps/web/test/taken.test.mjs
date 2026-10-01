import assert from "node:assert/strict";
import { test } from "node:test";
import { HEALTH_ORDER, healthOf, heardAt, LEASE, plain, span } from "../app/utils/taken.ts";

const hold = (over = {}) => ({
  agent: "agent-abcd-1234",
  asking: "",
  state: "claimed",
  claimed_at: "2026-10-01T10:00:00.000Z",
  lease_until: "2026-10-01T10:30:00.000Z",
  ...over,
});

test("a hold is waiting, quiet or working, and a question outranks the silence", () => {
  assert.equal(healthOf(hold()), "working");
  assert.equal(healthOf(hold({ state: "stalled" })), "quiet");
  assert.equal(healthOf(hold({ asking: "which?" })), "waiting");
  assert.equal(
    healthOf(hold({ asking: "which?", state: "stalled" })),
    "waiting",
    "it asked, then nobody answered",
  );
  assert.equal(healthOf(hold({ agent: "person-abc" })), "person");
  assert.ok(HEALTH_ORDER.waiting < HEALTH_ORDER.quiet && HEALTH_ORDER.quiet < HEALTH_ORDER.working);
});

test("an agent was last heard a lease before it runs out, and a person when they took it", () => {
  assert.equal(heardAt(hold()), Date.parse("2026-10-01T10:00:00.000Z"));
  assert.equal(LEASE, 30 * 60 * 1000);
  assert.equal(
    heardAt(
      hold({
        agent: "person-x",
        claimed_at: "2026-10-01T09:00:00.000Z",
        lease_until: "2026-10-08T09:00:00.000Z",
      }),
    ),
    Date.parse("2026-10-01T09:00:00.000Z"),
  );
});

test("a span reads as a person says it", () => {
  assert.equal(span(10_000), "just now");
  assert.equal(span(12 * 60_000), "12m");
  assert.equal(span(200 * 60_000), "3h 20m");
  assert.equal(span(50 * 3600_000), "2d");
  assert.equal(span(-5), "just now", "a clock a little behind is not negative time");
});

test("a message is one line, with pictures and files said as what they are", () => {
  assert.equal(
    plain(
      "see this\n![a](https://p.dev/v1/shots/abc123xyz)\n[orders.csv](https://p.dev/v1/attachments/def456uvw)",
    ),
    "see this [image] [file: orders.csv]",
  );
});
