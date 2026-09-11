/**
 * The paid tier's one dependency on somebody else's API, kept to a boundary two providers fit
 * behind.
 *
 * Passalong sells per seat to teams (`docs/PRD.md` §11) and the first paying teams and the Show HN
 * ones do not reach for the same processor, so both are here: Paystack and Stripe. The team picks
 * one when it subscribes and keeps it, since a subscription lives at the provider and nothing about
 * it can be moved.
 *
 * WHAT THIS MODULE OWNS is exactly two things: proving a webhook really came from the provider, and
 * turning the provider's vocabulary into ours. It owns no policy. What a plan permits lives in
 * `quota.ts`, what a route does about it lives in `index.ts`, and the mapping below decides only
 * which of our three plan values an event means.
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

async function hmac(algorithm: "SHA-256" | "SHA-512", secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

export const PROVIDERS = ["stripe", "paystack"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const isProvider = (v: string): v is Provider =>
  (PROVIDERS as readonly string[]).includes(v);

/**
 * What a provider event means here, in our words and no more of them.
 *
 * `plan` is the value to store, and it is one of the three `quota.ts` knows. `seats` is absent when
 * the event does not carry a seat count, which is most of them — a payment failing says nothing
 * about how many seats were bought, and writing zero would silently unseat the whole team.
 */
export interface PlanChange {
  subscription_id: string;
  plan: "team" | "lapsed" | "free";
  seats?: number;
  /** For the audit line in a log, never shown to a user. */
  reason: string;
}

/** Signature check failed, or the body is not an event we act on. Never throws with a secret in it. */
export class BillingError extends Error {}

/**
 * Stripe: `Stripe-Signature: t=<unix>,v1=<hex>`, HMAC-SHA256 over `${t}.${rawBody}`.
 *
 * The timestamp is inside the signed payload and is checked, because without a tolerance a captured
 * webhook can be replayed forever — and the event worth replaying is the one that says a
 * subscription is active.
 */
export async function verifyStripe(
  rawBody: string,
  header: string,
  secret: string,
  now = Date.now(),
  toleranceSeconds = 300,
): Promise<unknown> {
  if (!secret) throw new BillingError("stripe webhooks are not configured");
  const parts = new Map(
    header
      .split(",")
      .map((p) => p.trim().split("=", 2))
      .filter((p): p is [string, string] => p.length === 2)
      .map(([k, v]) => [k, v]),
  );
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) throw new BillingError("malformed Stripe-Signature header");
  const age = Math.abs(now / 1000 - Number(t));
  if (!Number.isFinite(age) || age > toleranceSeconds)
    throw new BillingError("Stripe-Signature timestamp is outside the tolerance");
  if (!eq(await hmac("SHA-256", secret, `${t}.${rawBody}`), v1))
    throw new BillingError("Stripe-Signature does not match");
  return JSON.parse(rawBody);
}

/**
 * Paystack: `x-paystack-signature`, HMAC-SHA512 of the raw body with the **secret key** — the same
 * key used to call their API, not a separate webhook secret.
 *
 * There is no timestamp in the scheme, so there is no replay window to check. That is the
 * provider's design and not something this can compensate for; what makes a replay harmless here is
 * that every event below is idempotent — it sets a plan to a value rather than moving it by a step.
 */
export async function verifyPaystack(
  rawBody: string,
  header: string,
  secret: string,
): Promise<unknown> {
  if (!secret) throw new BillingError("paystack webhooks are not configured");
  if (!header) throw new BillingError("missing x-paystack-signature");
  if (!eq(await hmac("SHA-512", secret, rawBody), header))
    throw new BillingError("x-paystack-signature does not match");
  return JSON.parse(rawBody);
}

/**
 * Stripe's vocabulary, narrowed to the four events that change what a team may do.
 *
 * Everything else Stripe sends is ignored rather than refused: a webhook endpoint that errors on an
 * event it does not care about is one the provider retries for a day and eventually disables.
 */
export function fromStripe(event: unknown): PlanChange | null {
  const e = event as {
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  const object = e.data?.object ?? {};
  const id = String(object.id ?? "");
  const quantity = Number(
    (object.quantity as number) ??
      (object.items as { data?: { quantity?: number }[] })?.data?.[0]?.quantity ??
      Number.NaN,
  );
  const seats = Number.isFinite(quantity) && quantity > 0 ? Math.trunc(quantity) : undefined;
  switch (e.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      // `past_due` is not lapsed yet: the provider is still retrying the card, and downgrading a
      // team on the first failed attempt makes a bank's overnight decline look like a cancellation.
      const status = String(object.status ?? "");
      if (status === "active" || status === "trialing")
        return { subscription_id: id, plan: "team", seats, reason: `stripe ${e.type} ${status}` };
      if (status === "canceled" || status === "unpaid")
        return { subscription_id: id, plan: "lapsed", reason: `stripe ${e.type} ${status}` };
      return null;
    }
    case "customer.subscription.deleted":
      return { subscription_id: id, plan: "lapsed", reason: "stripe subscription deleted" };
    default:
      return null;
  }
}

/** Paystack's vocabulary, narrowed the same way. */
export function fromPaystack(event: unknown): PlanChange | null {
  const e = event as { event?: string; data?: Record<string, unknown> };
  const data = e.data ?? {};
  const id = String(data.subscription_code ?? data.id ?? "");
  const seatsRaw = Number((data.quantity as number) ?? Number.NaN);
  const seats = Number.isFinite(seatsRaw) && seatsRaw > 0 ? Math.trunc(seatsRaw) : undefined;
  switch (e.event) {
    case "subscription.create":
    case "charge.success":
      return { subscription_id: id, plan: "team", seats, reason: `paystack ${e.event}` };
    case "subscription.not_renew":
      // They turned off renewal; the term they paid for is still theirs. Nothing changes until it
      // actually ends, which arrives as `subscription.disable`.
      return null;
    case "subscription.disable":
    case "invoice.payment_failed":
      return { subscription_id: id, plan: "lapsed", reason: `paystack ${e.event}` };
    default:
      return null;
  }
}

export const parseEvent = (provider: Provider, event: unknown): PlanChange | null =>
  provider === "stripe" ? fromStripe(event) : fromPaystack(event);
