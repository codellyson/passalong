// What actually goes out to a provider, asserted without a provider.
//
// The webhook half of billing has been tested to the edges since it went in, because a forged event
// is a free unlimited plan. The outbound half had nothing: `startCheckout` and `setSeats` were
// written from the two API references and never executed, so the first thing to find a wrong field
// name would have been a real checkout failing in front of a real customer.
//
// Real keys cannot answer that here — they are the operator's, they belong in `.dev.vars`, and
// nothing in this repository should hold one. What real keys *would* add over these tests is the
// provider validating ids that only exist in their account: a price id, a plan code, a live
// subscription. Everything this side of that — the endpoint, the encoding, the field names, where
// the metadata goes, how an error is read back — is ours to get wrong, and it is what is pinned
// here.
//
// Stripe's API is form-encoded with bracketed nested keys and Paystack's is JSON. Getting those the
// wrong way round fails in a way that reads like a credential problem, which is the wrong place to
// go looking.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { BillingError, setSeats, startCheckout } from "../src/billing.ts";

const KEYS = {
  STRIPE_SECRET: "sk_test_example",
  STRIPE_PRICE: "price_123",
  PAYSTACK_SECRET: "sk_test_paystack",
  PAYSTACK_PLAN: "PLN_123",
};

const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});

/** Records every request and answers with whatever the test lined up. */
function stub(...answers) {
  const seen = [];
  let i = 0;
  globalThis.fetch = async (url, init = {}) => {
    const body =
      init.body instanceof URLSearchParams ? init.body.toString() : (init.body ?? undefined);
    seen.push({
      url: String(url),
      method: init.method ?? "GET",
      headers: init.headers ?? {},
      body,
    });
    const a = answers[Math.min(i++, answers.length - 1)] ?? { ok: true, json: {} };
    return {
      ok: a.ok !== false,
      status: a.status ?? (a.ok === false ? 400 : 200),
      statusText: a.statusText ?? "OK",
      json: async () => a.json ?? {},
      text: async () => JSON.stringify(a.json ?? {}),
    };
  };
  return seen;
}

const form = (body) => Object.fromEntries(new URLSearchParams(body));

// ---- checkout ---------------------------------------------------------------------------------

test("a Stripe checkout is form-encoded, with the subject in subscription metadata", async () => {
  const seen = stub({ json: { url: "https://checkout.stripe.com/c/pay/abc" } });
  const out = await startCheckout("stripe", KEYS, {
    subject: { kind: "team", id: "t_abc" },
    seats: 4,
    email: "ada@example.com",
    returnTo: "https://passalong.dev/hub/settings",
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[0].headers.authorization, "Bearer sk_test_example");
  // Not JSON. Sending JSON here is refused in a way that reads like a bad key.
  assert.equal(seen[0].headers["content-type"], "application/x-www-form-urlencoded");

  const f = form(seen[0].body);
  assert.equal(f.mode, "subscription");
  assert.equal(f["line_items[0][price]"], "price_123");
  assert.equal(f["line_items[0][quantity]"], "4");
  assert.equal(f.customer_email, "ada@example.com");
  // On `subscription_data`, not on the session: the session is gone by the time the subscription
  // events arrive, and those events are the only thing that ever reads this back.
  assert.equal(f["subscription_data[metadata][team]"], "t_abc");
  assert.equal(f.success_url, "https://passalong.dev/hub/settings?billing=done");
  assert.equal(f.cancel_url, "https://passalong.dev/hub/settings?billing=cancelled");

  assert.deepEqual(out, { url: "https://checkout.stripe.com/c/pay/abc", mode: "test" });
});

test("a Solo checkout names the account instead, and asks for one seat", async () => {
  const seen = stub({ json: { url: "https://checkout.stripe.com/c/pay/solo" } });
  await startCheckout("stripe", KEYS, {
    subject: { kind: "account", id: "acc_1" },
    seats: 1,
    email: "ada@example.com",
    returnTo: "https://passalong.dev/hub/settings",
  });
  const f = form(seen[0].body);
  assert.equal(f["subscription_data[metadata][account]"], "acc_1");
  assert.equal(f["subscription_data[metadata][team]"], undefined, "exactly one subject, ever");
  assert.equal(f["line_items[0][quantity]"], "1");
});

test("a Paystack checkout is JSON, and hands back the authorization url", async () => {
  const seen = stub({ json: { data: { authorization_url: "https://checkout.paystack.com/xyz" } } });
  // Five seats rather than one, deliberately. With `seats: 1` a hardcoded quantity is invisible —
  // which it was, until a mutation test pointed out that billing a five-person team for one seat
  // would have passed everything here.
  const out = await startCheckout("paystack", KEYS, {
    subject: { kind: "team", id: "t_abc" },
    seats: 5,
    email: "ada@example.com",
    returnTo: "https://passalong.dev/hub/settings",
  });

  assert.equal(seen[0].url, "https://api.paystack.co/transaction/initialize");
  assert.equal(seen[0].headers["content-type"], "application/json");
  const body = JSON.parse(seen[0].body);
  assert.equal(body.email, "ada@example.com");
  assert.equal(body.plan, "PLN_123");
  assert.equal(body.quantity, 5, "what was asked for, not a constant");
  assert.equal(body.callback_url, "https://passalong.dev/hub/settings?billing=done");
  assert.deepEqual(body.metadata, { team: "t_abc" });
  assert.deepEqual(out, { url: "https://checkout.paystack.com/xyz", mode: "test" });
});

test("a Solo Paystack checkout names the account and asks for one seat", async () => {
  const seen = stub({
    json: { data: { authorization_url: "https://checkout.paystack.com/solo" } },
  });
  await startCheckout("paystack", KEYS, {
    subject: { kind: "account", id: "acc_1" },
    seats: 1,
    email: "ada@example.com",
    returnTo: "https://passalong.dev/hub/settings",
  });
  const body = JSON.parse(seen[0].body);
  assert.deepEqual(body.metadata, { account: "acc_1" }, "exactly one subject, ever");
  assert.equal(body.quantity, 1);
});

test("live keys are reported as live, off the key and nothing else", async () => {
  stub({ json: { url: "https://checkout.stripe.com/c/pay/abc" } });
  const out = await startCheckout(
    "stripe",
    { ...KEYS, STRIPE_SECRET: "sk_live_example" },
    {
      subject: { kind: "team", id: "t" },
      seats: 1,
      email: "a@b.c",
      returnTo: "https://passalong.dev/hub",
    },
  );
  assert.equal(out.mode, "live");
});

test("an unconfigured provider is refused before any request is made", async () => {
  const seen = stub();
  await assert.rejects(
    () =>
      startCheckout(
        "stripe",
        { ...KEYS, STRIPE_SECRET: "" },
        {
          subject: { kind: "team", id: "t" },
          seats: 1,
          email: "a@b.c",
          returnTo: "https://passalong.dev/hub",
        },
      ),
    BillingError,
  );
  // A missing price is the same class of mistake and must not reach the network either.
  await assert.rejects(
    () =>
      startCheckout(
        "stripe",
        { ...KEYS, STRIPE_PRICE: "" },
        {
          subject: { kind: "team", id: "t" },
          seats: 1,
          email: "a@b.c",
          returnTo: "https://passalong.dev/hub",
        },
      ),
    BillingError,
  );
  assert.equal(seen.length, 0, "nothing should have gone out");
});

test("the provider's own words come back, because they are the useful ones", async () => {
  stub({ ok: false, status: 400, json: { error: { message: "No such price: 'price_123'" } } });
  await assert.rejects(
    () =>
      startCheckout("stripe", KEYS, {
        subject: { kind: "team", id: "t" },
        seats: 1,
        email: "a@b.c",
        returnTo: "https://passalong.dev/hub",
      }),
    (e) => e instanceof BillingError && /No such price/.test(e.message),
  );
});

// ---- seats ------------------------------------------------------------------------------------

test("changing seats reads the subscription first, then moves the item's quantity", async () => {
  // The quantity lives on the subscription *item*, not the subscription, so the id has to be
  // fetched before anything can be changed — which is why this is two calls and not one.
  const seen = stub({ json: { items: { data: [{ id: "si_1" }] } } }, { json: {} });
  await setSeats("stripe", KEYS, "sub_1", 6);

  assert.equal(seen.length, 2);
  assert.equal(seen[0].method, "GET");
  assert.equal(seen[0].url, "https://api.stripe.com/v1/subscriptions/sub_1");
  assert.equal(seen[1].method, "POST");
  const f = form(seen[1].body);
  assert.equal(f["items[0][id]"], "si_1");
  assert.equal(f["items[0][quantity]"], "6");
  assert.equal(f.proration_behavior, "create_prorations");
});

test("a subscription with no item to change says so rather than appearing to succeed", async () => {
  stub({ json: { items: { data: [] } } });
  await assert.rejects(() => setSeats("stripe", KEYS, "sub_1", 6), BillingError);
});

test("Paystack refuses a seat change outright, without pretending to try", async () => {
  // Their subscriptions carry no quantity once started. Appearing to succeed would bill the old
  // number quietly, which is the worst of the three possible behaviours.
  const seen = stub();
  await assert.rejects(() => setSeats("paystack", KEYS, "SUB_1", 6), BillingError);
  assert.equal(seen.length, 0, "and it costs no request to find out");
});

test("an id with something odd in it is escaped into the path", async () => {
  const seen = stub({ json: { items: { data: [{ id: "si_1" }] } } }, { json: {} });
  await setSeats("stripe", KEYS, "sub/../evil", 2);
  assert.ok(seen[0].url.endsWith("/sub%2F..%2Fevil"), seen[0].url);
});
