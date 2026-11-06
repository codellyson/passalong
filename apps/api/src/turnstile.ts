// Cloudflare Turnstile on the hub's three open forms: signing up, signing in, and asking for a
// password reset. Each one either makes an account, tries a password, or sends an email to an
// address the caller typed, so each is worth a script's while and costs a person nothing to prove
// they are not one: the widget runs in managed mode and, for nearly everybody, never asks a thing.
//
// Only those three. The CLI signs in through the device flow and the MCP server through a token or
// OAuth, and neither can show a widget, so nothing here may stand in front of them. The other open
// routes are already gated by a secret only the right caller holds (a reset code, an invite code,
// an unsubscribe token, a device verifier), and the unsubscribe one is also posted by mail
// providers (RFC 8058), which run no script at all.
//
// Imports no sibling, so test/turnstile.test.mjs can run it with a stand-in fetch.

export const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The form field the widget fills, and the JSON field the hub sends it in. */
export const TOKEN_FIELD = "cf-turnstile-response";

/** Each form's `data-action`. Siteverify echoes it, so a token solved on one form opens no other. */
export type TurnstileAction = "signup" | "login" | "forgot";

/** Turnstile tokens are at most 2048 characters; anything longer is not one. */
const TOKEN_MAX = 2048;

export type TurnstileEnv = {
  /** The widget's secret key (`wrangler secret put TURNSTILE_SECRET`). Unset: no check at all. */
  TURNSTILE_SECRET?: string;
};

type Siteverify = {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
  metadata?: { result_with_testing_key?: boolean };
};

export type TurnstileCheck = { ok: true } | { ok: false; reason: string };

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** What a person is told when the check fails. The widget gets a fresh token on the next try. */
export const NOT_VERIFIED =
  "We couldn't confirm this came from a person. Wait a moment for the check under the form to finish, then try again.";

/**
 * Whether a request carries a Turnstile token that Siteverify accepts for this form on this host.
 *
 * Off when `TURNSTILE_SECRET` is unset, like every other integration here: a deployment that has
 * not been given a widget runs exactly as before. Once the secret is set it fails closed — a
 * missing token, an unreachable Siteverify, a token from another form or another host are all
 * refused.
 *
 * The host it must come from is the request's own, because the hub and the API are one origin:
 * the page that ran the widget is the page that posts here. Cloudflare's test keys answer for
 * `example.com` with no action and say so in `metadata.result_with_testing_key`; a result like that
 * is accepted only on localhost, so a test secret left in production refuses everyone rather than
 * letting everyone through.
 */
export async function checkTurnstile(
  env: TurnstileEnv,
  input: { token: unknown; action: TurnstileAction; url: string; ip?: string },
  fetcher: typeof fetch = fetch,
): Promise<TurnstileCheck> {
  const secret = env.TURNSTILE_SECRET;
  if (!secret) return { ok: true };

  const token = input.token;
  if (typeof token !== "string" || token.length === 0 || token.length > TOKEN_MAX)
    return { ok: false, reason: "missing-token" };

  const body = new URLSearchParams({ secret, response: token });
  if (input.ip) body.set("remoteip", input.ip);

  let result: Siteverify;
  try {
    const res = await fetcher(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, reason: `siteverify-${res.status}` };
    result = (await res.json()) as Siteverify;
  } catch {
    return { ok: false, reason: "siteverify-unreachable" };
  }

  if (result?.success !== true)
    return { ok: false, reason: (result?.["error-codes"] ?? []).join(",") || "not-success" };

  const host = new URL(input.url).hostname;
  if (result.metadata?.result_with_testing_key)
    return LOCAL.has(host) ? { ok: true } : { ok: false, reason: "testing-key" };

  if (result.action !== input.action) return { ok: false, reason: "wrong-action" };
  if (result.hostname !== host) return { ok: false, reason: "wrong-hostname" };
  return { ok: true };
}
