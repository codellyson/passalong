// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { line, SINCE_RE, summary } from "../src/log.ts";

const row = (over = {}) => ({
  act: "published",
  at: "2026-09-11T10:00:00.000Z",
  detail: "",
  guide_id: "k3mq2xa7",
  title: "Add Paystack webhook verification",
  source_context: "techchak-backend",
  share_key: "dpmmerhnfh2faf9sceu58j",
  owner: "acc_me",
  ...over,
});

test("every act renders a sentence in the first person's past tense", () => {
  const said = (over) => line(row(over));
  assert.equal(said({ act: "published" }), 'published "Add Paystack webhook verification"');
  assert.equal(said({ act: "pulled" }), 'pulled "Add Paystack webhook verification"');
  assert.equal(said({ act: "works" }), 'said "Add Paystack webhook verification" works');
  assert.equal(said({ act: "took" }), 'took "Add Paystack webhook verification"');
});

test("a negative act carries the reason, because the reason is the whole point of saying no", () => {
  assert.equal(
    line(row({ act: "broken", detail: "HMAC is over the parsed body" })),
    'said "Add Paystack webhook verification" is broken: HMAC is over the parsed body',
  );
  assert.equal(
    line(row({ act: "passed", detail: "not my service" })),
    'passed "Add Paystack webhook verification" back: not my service',
  );
});

test("a positive act never grows a colon, even when a row carries a note", () => {
  // `works` and `took` both allow a note and neither is asking for an explanation. Appending it
  // would make a one-word confirmation read like a defence of itself.
  assert.equal(
    line(row({ act: "works", detail: "ran clean" })),
    'said "Add Paystack webhook verification" works',
  );
  assert.equal(
    line(row({ act: "took", detail: "on it today" })),
    'took "Add Paystack webhook verification"',
  );
});

test("a guide with no title still produces a sentence", () => {
  // Title is written from the document's frontmatter, and a draft published without one is legal.
  assert.equal(line(row({ title: "" })), "published a guide");
});

test("mine is the author, not the actor: every row in a log is something you did", () => {
  const to = summary("https://passalong.dev", "acc_me");
  assert.equal(to(row()).mine, true);
  assert.equal(to(row({ owner: "acc_bob" })).mine, false);
});

test("a row carries the link back to the thing it is about", () => {
  const one = summary("https://passalong.dev", "acc_me")(row());
  assert.equal(one.url, "https://passalong.dev/g/k3mq2xa7/dpmmerhnfh2faf9sceu58j");
  assert.equal(one.guide, "k3mq2xa7");
  assert.equal(one.repo, "techchak-backend");
});

test("since accepts a date prefix and refuses anything that is not one", () => {
  // `at` is an ISO string and the filter is a string comparison, so a prefix is a valid bound and
  // anything else silently matches everything or nothing. That is why the route refuses it.
  for (const ok of ["2026", "2026-09", "2026-09-11", "2026-09-11T10:00:00.000Z"])
    assert.ok(SINCE_RE.test(ok), `${ok} should be accepted`);
  for (const bad of ["last-week", "7d", "september", "26-09", "", "2026-9"])
    assert.ok(!SINCE_RE.test(bad), `${bad} should be refused`);
});
