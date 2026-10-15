// Runs on Node 22.18+ with built-in type stripping (`node --test`).
//
// Signature verification is the one place in the paid tier where being wrong is not a bug but a
// free unlimited plan for anyone who can POST, so every way of getting it wrong is pinned here.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BillingError, fromBachs, modeOf, TEAM_SEATS, verifyWebhook } from "../src/billing.ts";

const SECRET = "whsec_example";
const BODY = JSON.stringify({
  type: "customer.subscription.updated",
  data: { subscription_id: "sub_1", status: "active" },
});
const NOW = 1_800_000_000_000;
const T = NOW / 1000;

const sign = (body, secret, t) => createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
const header = (body, secret, t, ...more) =>
  [`t=${t}`, `v1=${sign(body, secret, t)}`, ...more].join(",");

// ---- signature --------------------------------------------------------------------------------

test("a correctly signed webhook parses", async () => {
  const event = await verifyWebhook(BODY, header(BODY, SECRET, T), SECRET, NOW);
  assert.equal(event.data.subscription_id, "sub_1");
});

test("a signature over different bytes is refused", async () => {
  const tampered = BODY.replace("active", "trialing");
  await assert.rejects(verifyWebhook(tampered, header(BODY, SECRET, T), SECRET, NOW), BillingError);
});

test("a signature from the wrong secret is refused", async () => {
  await assert.rejects(
    verifyWebhook(BODY, header(BODY, "whsec_other", T), SECRET, NOW),
    /does not match/,
  );
});

test("during a rotation any of the signatures may be ours", async () => {
  const rotated = `t=${T},v1=${sign(BODY, "whsec_old", T)},v1=${sign(BODY, SECRET, T)}`;
  const event = await verifyWebhook(BODY, rotated, SECRET, NOW);
  assert.equal(event.type, "customer.subscription.updated");
});

test("a captured webhook cannot be replayed later", async () => {
  const old = T - 301;
  await assert.rejects(verifyWebhook(BODY, header(BODY, SECRET, old), SECRET, NOW), /tolerance/);
  // Inside the window still verifies.
  await verifyWebhook(BODY, header(BODY, SECRET, T - 299), SECRET, NOW);
});

test("a header missing its parts is refused rather than ignored", async () => {
  await assert.rejects(verifyWebhook(BODY, "", SECRET, NOW), /malformed/);
  await assert.rejects(verifyWebhook(BODY, `t=${T}`, SECRET, NOW), /malformed/);
  await assert.rejects(verifyWebhook(BODY, `t=,v1=`, SECRET, NOW), /malformed/);
});

test("with no configured secret nothing verifies", async () => {
  await assert.rejects(verifyWebhook(BODY, header(BODY, "", T), "", NOW), /not configured/);
});

// ---- mapping ----------------------------------------------------------------------------------

const event = (type, data, created_at = "2026-10-14T10:00:00Z") => ({
  id: "evt_1",
  type,
  created_at,
  data: { subscription_id: "sub_1", ...data },
});

test("an active team subscription is a paid team of ten", () => {
  const change = fromBachs(
    event("customer.subscription.created", { status: "active", metadata: { team: "t1" } }),
  );
  assert.equal(change.plan, "team");
  assert.equal(change.seats, TEAM_SEATS);
  assert.equal(change.team_id, "t1");
  assert.equal(change.account_id, undefined);
  assert.equal(change.at, "2026-10-14T10:00:00Z");
});

test("a Solo subscription names the account and carries no seats", () => {
  const change = fromBachs(
    event("customer.subscription.created", { status: "trialing", metadata: { account: "a1" } }),
  );
  assert.equal(change.plan, "team");
  assert.equal(change.account_id, "a1");
  assert.equal(change.team_id, undefined);
  assert.equal(change.seats, undefined);
});

test("past_due is not lapsed: the card is still being retried", () => {
  assert.equal(
    fromBachs(event("customer.subscription.updated", { status: "past_due" })).plan,
    "team",
  );
});

test("cancelled, unpaid or deleted lapses, and a lapse never reports seats", () => {
  for (const [type, status] of [
    ["customer.subscription.updated", "canceled"],
    ["customer.subscription.updated", "unpaid"],
    ["customer.subscription.deleted", "active"],
  ]) {
    const change = fromBachs(event(type, { status, metadata: { team: "t1" } }));
    assert.equal(change.plan, "lapsed", `${type} ${status}`);
    assert.equal(change.seats, undefined);
  }
});

test("a cancelled plan is still paid, and says when it ends", () => {
  const end = "2026-11-14T18:54:51Z";
  const cancelled = fromBachs(
    event("customer.subscription.updated", {
      status: "active",
      cancel_at_period_end: true,
      current_period_end: end,
    }),
  );
  assert.equal(cancelled.plan, "team");
  assert.equal(cancelled.ends, end);
  // Resumed ("Keep subscription"): nothing is ending, which clears the date.
  const resumed = fromBachs(
    event("customer.subscription.updated", {
      status: "active",
      cancel_at_period_end: false,
      current_period_end: end,
    }),
  );
  assert.equal(resumed.ends, "");
  // Once it has ended there is no date to show: the plan says lapsed.
  assert.equal(fromBachs(event("customer.subscription.deleted", { status: "canceled" })).ends, "");
});

test("an event nobody mapped is ignored, not refused", () => {
  assert.equal(fromBachs(event("payment.succeeded", { status: "active" })), null);
  assert.equal(fromBachs(event("customer.subscription.updated", { status: "paused" })), null);
  assert.equal(fromBachs(event("customer.subscription.updated", { subscription_id: "" })), null);
  assert.equal(fromBachs(null), null);
});

test("the mode is read off the key, never configured beside it", () => {
  assert.equal(modeOf(""), "unset");
  assert.equal(modeOf("sk_sandbox_abc"), "test");
  assert.equal(modeOf("sk_live_abc"), "live");
});

// ---- the route --------------------------------------------------------------------------------

// The route has no harness here, so its one rule about other subscriptions is pinned by reading it:
// a late lapse from an old subscription must not end the one that replaced it, and a second paying
// subscription for the same plan is reported rather than bound. Checked end to end against a local
// server with signed events when it went in.
test("an event from another subscription neither ends nor replaces the stored one", () => {
  const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const route = index.slice(
    index.indexOf('app.post("/v1/billing/webhook/bachs"'),
    index.indexOf("const billingFailed ="),
  );
  assert.match(route, /if \(change\.plan === "lapsed"\) return true;/);
  assert.match(route, /kind: "billed_twice"/);
  // Asked of both subjects, after the out-of-order check.
  assert.equal([...route.matchAll(/stale\((solo|team)\) \|\| \(await elsewhere\(/g)].length, 2);
});
