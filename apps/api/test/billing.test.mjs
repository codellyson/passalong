// Runs on Node 22.18+ with built-in type stripping (`node --test`).
//
// Signature verification is the one place in the paid tier where being wrong is not a bug but a
// free unlimited plan for anyone who can POST, so every way of getting it wrong is pinned here.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  BillingError,
  fromPaystack,
  fromStripe,
  isProvider,
  modeOf,
  PROVIDERS,
  parseEvent,
  verifyPaystack,
  verifyStripe,
} from "../src/billing.ts";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({
  type: "customer.subscription.updated",
  data: { object: { id: "sub_1" } },
});

const stripeSig = (body, secret, t) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
const paystackSig = (body, secret) => createHmac("sha512", secret).update(body).digest("hex");

// ---- Stripe -----------------------------------------------------------------------------------

test("a correctly signed Stripe webhook parses", async () => {
  const now = Date.now();
  const t = Math.floor(now / 1000);
  const event = await verifyStripe(BODY, stripeSig(BODY, SECRET, t), SECRET, now);
  assert.equal(event.type, "customer.subscription.updated");
});

test("a Stripe signature over different bytes is refused", async () => {
  const now = Date.now();
  const t = Math.floor(now / 1000);
  const signed = stripeSig(BODY, SECRET, t);
  // The body is what is signed, so re-serialising it — which is what happens the moment anything
  // parses the request before verifying it — invalidates the signature. This is the trap.
  const reserialised = JSON.stringify(JSON.parse(BODY.replace('"sub_1"', '"sub_hacked"')));
  await assert.rejects(() => verifyStripe(reserialised, signed, SECRET, now), BillingError);
});

test("a Stripe signature from the wrong secret is refused", async () => {
  const now = Date.now();
  const t = Math.floor(now / 1000);
  await assert.rejects(
    () => verifyStripe(BODY, stripeSig(BODY, "whsec_someone_elses", t), SECRET, now),
    BillingError,
  );
});

test("a captured Stripe webhook cannot be replayed tomorrow", async () => {
  const now = Date.now();
  const old = Math.floor(now / 1000) - 86_400;
  // Correctly signed, and that is the point: the signature stays valid forever, so the timestamp is
  // the only thing standing between a captured "subscription is active" and a permanent free plan.
  await assert.rejects(
    () => verifyStripe(BODY, stripeSig(BODY, SECRET, old), SECRET, now),
    BillingError,
  );
});

test("a Stripe header missing its parts is refused rather than ignored", async () => {
  const now = Date.now();
  for (const header of ["", "t=123", "v1=abc", "nonsense", "t=,v1="])
    await assert.rejects(() => verifyStripe(BODY, header, SECRET, now), BillingError);
});

test("with no configured secret nothing verifies", async () => {
  const now = Date.now();
  const t = Math.floor(now / 1000);
  // A deployment without billing configured must refuse every webhook, not accept every webhook.
  await assert.rejects(() => verifyStripe(BODY, stripeSig(BODY, "", t), "", now), BillingError);
  await assert.rejects(() => verifyPaystack(BODY, paystackSig(BODY, ""), ""), BillingError);
});

// ---- Paystack ---------------------------------------------------------------------------------

test("a correctly signed Paystack webhook parses", async () => {
  const body = JSON.stringify({
    event: "subscription.create",
    data: { subscription_code: "SUB_x" },
  });
  const event = await verifyPaystack(body, paystackSig(body, SECRET), SECRET);
  assert.equal(event.event, "subscription.create");
});

test("a Paystack signature over different bytes is refused", async () => {
  const body = JSON.stringify({
    event: "subscription.create",
    data: { subscription_code: "SUB_x" },
  });
  const signed = paystackSig(body, SECRET);
  const tampered = body.replace("SUB_x", "SUB_y");
  await assert.rejects(() => verifyPaystack(tampered, signed, SECRET), BillingError);
});

test("a missing Paystack signature is refused", async () => {
  await assert.rejects(() => verifyPaystack("{}", "", SECRET), BillingError);
});

// ---- what an event means ----------------------------------------------------------------------

test("an active Stripe subscription is a paid team, with its seat count", () => {
  const change = fromStripe({
    type: "customer.subscription.updated",
    data: { object: { id: "sub_1", status: "active", items: { data: [{ quantity: 4 }] } } },
  });
  assert.deepEqual(change, {
    subscription_id: "sub_1",
    plan: "team",
    seats: 4,
    team_id: undefined,
    account_id: undefined,
    reason: "stripe customer.subscription.updated active",
  });
});

test("past_due is not lapsed: the card is still being retried", () => {
  // Downgrading on the first failed attempt makes an overnight bank decline look like a
  // cancellation, and the team finds out by being unable to hand anything over.
  assert.equal(
    fromStripe({
      type: "customer.subscription.updated",
      data: { object: { id: "s", status: "past_due" } },
    }),
    null,
  );
});

test("a cancelled or deleted Stripe subscription lapses the team", () => {
  for (const [type, status] of [
    ["customer.subscription.updated", "canceled"],
    ["customer.subscription.deleted", "active"],
  ]) {
    const change = fromStripe({ type, data: { object: { id: "s", status } } });
    assert.equal(change?.plan, "lapsed", `${type}/${status}`);
  }
});

test("an event that says nothing about seats does not report zero of them", () => {
  // Writing zero would silently unseat the whole team on a payment retry.
  const change = fromStripe({
    type: "customer.subscription.updated",
    data: { object: { id: "s", status: "active" } },
  });
  assert.equal(change?.plan, "team");
  assert.equal(change?.seats, undefined);
});

test("turning off Paystack renewal changes nothing until the term actually ends", () => {
  // They paid for the term; `subscription.not_renew` only says they will not pay for the next one.
  assert.equal(
    fromPaystack({ event: "subscription.not_renew", data: { subscription_code: "S" } }),
    null,
  );
  assert.equal(
    fromPaystack({ event: "subscription.disable", data: { subscription_code: "S" } })?.plan,
    "lapsed",
  );
});

test("an event nobody mapped is ignored, not refused", () => {
  // A webhook endpoint that errors on an event it does not care about is one the provider retries
  // for a day and then disables — taking the events that do matter with it.
  assert.equal(fromStripe({ type: "invoice.created", data: { object: {} } }), null);
  assert.equal(fromPaystack({ event: "customeridentification.success", data: {} }), null);
});

test("the provider is a closed set", () => {
  assert.deepEqual([...PROVIDERS], ["stripe", "paystack"]);
  assert.ok(isProvider("stripe"));
  assert.ok(!isProvider("STRIPE"), "the path segment is matched exactly, not case-folded");
  assert.ok(!isProvider("paypal"));
  assert.equal(
    parseEvent("paystack", { event: "subscription.disable", data: { id: 1 } })?.plan,
    "lapsed",
  );
});

test("the team rides along in metadata, which is how a first subscription is matched", () => {
  // Nothing on the team points at the subscription until this event arrives — the id does not exist
  // when somebody is sent to a checkout page — so without the metadata the very first webhook about
  // a new subscription could never find its way home.
  assert.equal(
    fromStripe({
      type: "customer.subscription.created",
      data: { object: { id: "sub_new", status: "active", metadata: { team: "t_abc" } } },
    })?.team_id,
    "t_abc",
  );
  assert.equal(
    fromPaystack({
      event: "subscription.create",
      data: { subscription_code: "SUB_new", metadata: { team: "t_abc" } },
    })?.team_id,
    "t_abc",
  );
});

test("the mode is read off the key, never configured beside it", () => {
  // A `mode` setting somebody has to remember to flip is how a product spends three weeks quietly
  // taking test payments.
  assert.equal(modeOf("sk_test_abc"), "test");
  assert.equal(modeOf("sk_live_abc"), "live");
  assert.equal(modeOf(""), "unset");
});

test("a Solo subscription names the account, and a team one names the team", () => {
  // Exactly one of the two is ever set, because checkout writes exactly one metadata key. The
  // webhook picks its subject off whichever arrived, which is how a first subscription — one whose
  // id nothing has stored yet — is matched at all.
  const solo = fromStripe({
    type: "customer.subscription.created",
    data: { object: { id: "sub_s", status: "active", metadata: { account: "acc_1" } } },
  });
  assert.equal(solo?.account_id, "acc_1");
  assert.equal(solo?.team_id, undefined);

  const team = fromPaystack({
    event: "subscription.create",
    data: { subscription_code: "SUB_t", metadata: { team: "t_1" } },
  });
  assert.equal(team?.team_id, "t_1");
  assert.equal(team?.account_id, undefined);
});
