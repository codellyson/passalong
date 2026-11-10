/**
 * Settings that only work with a partner, and which of them a deployment has half set.
 *
 * Every integration here is off when its keys are unset, which is the point: a deployment that was
 * never told about Turnstile, push, billing or the reader runs without them. What that rule cannot
 * cover is a group set halfway. Production once had `TURNSTILE_SECRET` and no site key: the hub drew
 * no widget, the API refused every sign-in with 403, and nothing said why. `halfSet()` names such a
 * group so `/health` and the admins can say it.
 *
 * Names only, never a value: `/health` is public, and an admin's mail is mail.
 *
 * Imports no sibling, so `test/config.test.mjs` runs it under Node.
 */

type Env = Record<string, unknown>;

const has = (env: Env, name: string) => typeof env[name] === "string" && env[name] !== "";

/** Each group: the settings that mean someone meant to turn it on, and whether it then works. */
const GROUPS: { name: string; settings: string[]; complete: (env: Env) => boolean }[] = [
  {
    // turnstile.ts checks with the secret; the hub draws the widget from the site key
    // (server/plugins/turnstile.ts). The secret alone refuses every tokenless sign-in.
    name: "turnstile",
    settings: ["TURNSTILE_SECRET", "NUXT_PUBLIC_TURNSTILE_SITE_KEY"],
    complete: (env) => has(env, "TURNSTILE_SECRET") && has(env, "NUXT_PUBLIC_TURNSTILE_SITE_KEY"),
  },
  {
    // Push needs both keys; the subject has a default (index.ts).
    name: "push",
    settings: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
    complete: (env) => has(env, "VAPID_PUBLIC_KEY") && has(env, "VAPID_PRIVATE_KEY"),
  },
  {
    // The key turns the plans on in the hub; each product is a checkout (startCheckout in
    // billing.ts); the webhook secret is what writes a plan once someone has paid.
    name: "billing",
    settings: ["BACHS_SECRET", "BACHS_WEBHOOK_SECRET", "BACHS_TEAM_PRODUCT", "BACHS_SOLO_PRODUCT"],
    complete: (env) =>
      ["BACHS_SECRET", "BACHS_WEBHOOK_SECRET", "BACHS_TEAM_PRODUCT", "BACHS_SOLO_PRODUCT"].every(
        (s) => has(env, s),
      ),
  },
  {
    // readerOn() in reader.ts, written out again because this file imports no sibling.
    name: "reader",
    settings: ["READER_PROVIDER", "READER_KEY", "READER_MODEL", "READER_URL"],
    complete: (env) =>
      ["anthropic", "openai", "google", "openai-compatible"].includes(
        String(env.READER_PROVIDER),
      ) &&
      has(env, "READER_KEY") &&
      has(env, "READER_MODEL") &&
      (env.READER_PROVIDER !== "openai-compatible" || has(env, "READER_URL")),
  },
];

/** The groups with some setting present and not enough to work, by name, in a fixed order. */
export function halfSet(env: Env): string[] {
  return GROUPS.filter((g) => g.settings.some((s) => has(env, s)) && !g.complete(env)).map(
    (g) => g.name,
  );
}
