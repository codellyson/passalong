/**
 * The paid tier's one dependency on somebody else's API: Bachs (docs.bachs.io), a merchant of
 * record that sells subscriptions through a hosted checkout and tells us about them by webhook.
 *
 * Two products, both flat: Team ($20 a month for up to `TEAM_SEATS` people) and Solo ($5 a month,
 * one person). Neither has a quantity, so there is no seat count to change from here — a team that
 * outgrows ten is arranged by hand until a recurring quantity has been proven in the sandbox.
 *
 * WHAT THIS MODULE OWNS is exactly two things: proving a webhook really came from Bachs, and turning
 * its vocabulary into ours. It owns no policy. What a plan permits lives in `quota.ts`, what a route
 * does about it lives in `index.ts`, and the mapping below decides only which of our plan values an
 * event means.
 *
 * WHY IT IS ITS OWN FILE AND IMPORTS NO SIBLING. Signature verification is the one piece of this
 * feature where being wrong is not a bug but a free unlimited plan for anyone who can POST — so it
 * has to be unit-testable, and a value import of a sibling `.ts` is what Node's type stripping
 * cannot resolve (the same constraint that keeps `chatCard` inside notify.ts). `eq()` below is
 * therefore a local copy of `timingSafeEqual` rather than an import of it.
 */

/** Compare without leaking where two secrets diverge. A local copy on purpose — see the header. */
function eq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

/** How many people the Team product covers. The product is flat-priced, so this is fixed here. */
export const TEAM_SEATS = 10;

/**
 * What a Bachs event means here, in our words and no more of them.
 *
 * `plan` is the value to store, and it is one of the values `quota.ts` knows. `seats` is absent
 * when the event is not about a team, or does not grant one — a lapse says nothing about how many
 * seats were bought, and writing zero would silently unseat the whole team.
 */
export interface PlanChange {
  subscription_id: string;
  plan: "team" | "lapsed";
  seats?: number;
  /**
   * The team this is about, carried in the subscription's metadata because the first event about a
   * subscription cannot be found any other way.
   *
   * A subscription id does not exist until the customer has finished paying, so at the moment we
   * send somebody to a checkout page there is nothing to store against the team — and the webhook
   * that follows would look up a subscription nobody has ever seen and give up. We put the team id
   * into the checkout's metadata, Bachs copies it to the subscription and hands it back on every
   * event about it, and the first event is what binds the two together.
   */
  team_id?: string;
  /** The account, when what was bought is a Solo plan. Exactly one of these two is ever set. */
  account_id?: string;
  /**
   * When Bachs says the event happened. Delivery is at-least-once and out of order, so a route
   * compares this against when the stored plan was set and drops anything older.
   */
  at?: string;
  /** For the audit line in a log, never shown to a user. */
  reason: string;
}

export class BillingError extends Error {}

/**
 * `X-Bachs-Signature-V2: t=<unix>,v1=<hex>[,v1=<hex>…]`, HMAC-SHA256 over `${t}.${rawBody}`.
 *
 * `v1` repeats once per valid signing secret while one is being rotated, so any match counts. The
 * timestamp is inside the signed payload and is checked, because without a tolerance a captured
 * webhook can be replayed forever — and the event worth replaying is the one that says a
 * subscription is active.
 */
export async function verifyWebhook(
  rawBody: string,
  header: string,
  secret: string,
  now = Date.now(),
  toleranceSeconds = 300,
): Promise<unknown> {
  if (!secret) throw new BillingError("billing webhooks are not configured");
  const parts = header
    .split(",")
    .map((p) => p.trim().split("=", 2))
    .filter((p): p is [string, string] => p.length === 2);
  const t = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !signatures.length) throw new BillingError("malformed X-Bachs-Signature-V2 header");
  const age = Math.abs(now / 1000 - Number(t));
  if (!Number.isFinite(age) || age > toleranceSeconds)
    throw new BillingError("X-Bachs-Signature-V2 timestamp is outside the tolerance");
  const expected = await hmac(secret, `${t}.${rawBody}`);
  if (!signatures.some((s) => eq(expected, s)))
    throw new BillingError("X-Bachs-Signature-V2 does not match");
  return JSON.parse(rawBody);
}

/** Statuses that still grant the plan. `past_due` is here on purpose: the card is being retried. */
const PAYING = new Set(["trialing", "active", "past_due"]);
/** Statuses that end it. Anything else Bachs invents later changes nothing until it is mapped. */
const ENDED = new Set(["canceled", "unpaid"]);

/**
 * Bachs's vocabulary, narrowed to the three subscription events that change what someone may do.
 *
 * Everything else is ignored rather than refused: a webhook endpoint that errors on an event it does
 * not care about is one the provider retries for a day and eventually disables.
 */
export function fromBachs(event: unknown): PlanChange | null {
  const e = event as {
    type?: string;
    created_at?: string;
    data?: {
      subscription_id?: string;
      status?: string;
      metadata?: Record<string, string>;
    };
  };
  if (!e?.type?.startsWith("customer.subscription.")) return null;
  const d = e.data;
  if (!d?.subscription_id) return null;
  const team_id = d.metadata?.team || undefined;
  const account_id = team_id ? undefined : d.metadata?.account || undefined;
  const base = { subscription_id: d.subscription_id, team_id, account_id, at: e.created_at };

  const status = d.status ?? "";
  if (e.type === "customer.subscription.deleted" || ENDED.has(status))
    return { ...base, plan: "lapsed", reason: `${e.type}: ${status || "deleted"}` };
  if (PAYING.has(status))
    return {
      ...base,
      plan: "team",
      seats: team_id ? TEAM_SEATS : undefined,
      reason: `${e.type}: ${status}`,
    };
  return null;
}

/**
 * The mode is read off the key itself (`sk_sandbox_…` against `sk_live_…`), so it cannot disagree
 * with reality — a `mode` setting somebody has to remember to flip is exactly how a product spends
 * three weeks taking test payments. The hub shows it, because "we were in test mode the whole time"
 * is only funny once.
 */
export const modeOf = (key: string): "test" | "live" | "unset" =>
  !key ? "unset" : key.startsWith("sk_sandbox_") ? "test" : "live";

/** The key decides the host as well as the mode: a sandbox key is refused by the live API. */
const apiBase = (key: string) =>
  modeOf(key) === "test" ? "https://sandbox-api.bachs.io" : "https://api.bachs.io";

export interface BillingKeys {
  BACHS_SECRET?: string;
  BACHS_TEAM_PRODUCT?: string;
  BACHS_SOLO_PRODUCT?: string;
}

/** Where to send somebody to start paying, or to manage what they pay for. */
export interface Checkout {
  url: string;
  mode: "test" | "live";
}

async function call(url: string, secret: string, body?: unknown, method = "POST") {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {}
  if (!res.ok) {
    // The provider's own words, which are usually the useful ones ("Product not found"), capped so
    // a stack trace of theirs cannot become a page of ours. Never the key, which is only in a header.
    const message =
      ((parsed.error as { message?: string } | undefined)?.message ??
        (parsed.message as string | undefined) ??
        text) ||
      `${res.status} ${res.statusText}`;
    throw new BillingError(String(message).slice(0, 300));
  }
  return parsed;
}

/**
 * What a person sees when this deployment has no keys. The hub prints a refusal verbatim, and "not
 * configured on this deployment" is a sentence for whoever runs the server, not for whoever is
 * trying to pay.
 */
export const PAYMENTS_NOT_SET_UP = "Payments aren't set up yet. Try again later.";

/**
 * Start a subscription, and hand back where to send the person.
 *
 * A hosted page rather than a card form, because the alternative is this product handling card
 * details — which it will not do. The subject rides along in metadata under its own key, `team` or
 * `account`, which is how the first webhook about a new subscription finds its way home (see
 * `PlanChange.team_id`).
 */
export async function startCheckout(
  keys: BillingKeys,
  {
    subject,
    email,
    returnTo,
  }: {
    subject: { kind: "team" | "account"; id: string };
    email: string;
    returnTo: string;
  },
): Promise<Checkout> {
  const secret = keys.BACHS_SECRET || "";
  const product = subject.kind === "team" ? keys.BACHS_TEAM_PRODUCT : keys.BACHS_SOLO_PRODUCT;
  if (!secret || !product) throw new BillingError(PAYMENTS_NOT_SET_UP);
  const out = await call(`${apiBase(secret)}/v1/checkout-sessions`, secret, {
    product_cart: [{ product_id: product, quantity: 1 }],
    customer: { email },
    billing_currency: "USD",
    metadata: { [subject.kind]: subject.id },
    success_url: `${returnTo}?billing=done`,
    cancel_url: `${returnTo}?billing=cancelled`,
  });
  const url = out.checkout_url;
  if (typeof url !== "string" || !url) throw new BillingError("Bachs sent no checkout page back.");
  return { url, mode: modeOf(secret) as "test" | "live" };
}

/**
 * A one-time link to Bachs's own billing page for whoever pays for `subscriptionId`: card, invoices,
 * cancelling. Made fresh per click, because the link is a credential for that customer.
 *
 * The customer is read off the subscription rather than stored beside it, so there is one handle on
 * the paying thing and nothing that can drift from it.
 */
export async function portalSession(keys: BillingKeys, subscriptionId: string): Promise<Checkout> {
  const secret = keys.BACHS_SECRET || "";
  if (!secret) throw new BillingError(PAYMENTS_NOT_SET_UP);
  const base = apiBase(secret);
  const sub = (await call(
    `${base}/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    secret,
    undefined,
    "GET",
  )) as { customer?: { customer_id?: string }; customer_id?: string };
  const customer = sub.customer?.customer_id || sub.customer_id;
  if (!customer) throw new BillingError("Bachs has no customer on that subscription.");
  const out = await call(
    `${base}/v1/customers/${encodeURIComponent(customer)}/portal-sessions`,
    secret,
  );
  if (typeof out.url !== "string" || !out.url)
    throw new BillingError("Bachs sent no billing page back.");
  return { url: out.url, mode: modeOf(secret) as "test" | "live" };
}
