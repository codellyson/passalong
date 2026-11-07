// Turnstile on the sign-in screen: the widget, what the forms send, and the policy that lets the
// widget load on the hub and nowhere else. The check itself is apps/api/test/turnstile.test.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { TOKEN_FIELD } from "../../api/src/turnstile.ts";
import { hubHeaders, VIEW_HEADERS } from "../shared/csp.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const signIn = read("app/components/hub/SignIn.vue");
const widget = read("app/composables/useTurnstile.ts");
const config = read("nuxt.config.ts");
const plugin = read("server/plugins/turnstile.ts");

const directive = (policy, name) =>
  policy
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `)) ?? "";

test("the hub policy lets Turnstile's script and frame in, and the no-script pages stay shut", () => {
  const hub = hubHeaders("n0nce")["content-security-policy"];
  for (const name of ["script-src", "script-src-elem", "frame-src"])
    assert.match(directive(hub, name), / https:\/\/challenges\.cloudflare\.com(\s|$)/, name);
  // connect-src is untouched: the browser never calls Siteverify, only our own API does.
  assert.equal(directive(hub, "connect-src"), "connect-src 'self'");
  assert.doesNotMatch(VIEW_HEADERS["content-security-policy"], /challenges\.cloudflare\.com/);
});

test("the forms send the token in the field the API reads, named for the form", () => {
  assert.match(widget, new RegExp(`TURNSTILE_FIELD = "${TOKEN_FIELD}"`));
  assert.match(signIn, /body\[TURNSTILE_FIELD\] = await turnstile\.token\(\)/);
  // The action is the mode — login, signup or forgot — so a token for one form opens no other.
  assert.match(signIn, /useTurnstile\(check, mode\)/);
  assert.match(widget, /action: action\.value/);
  assert.match(widget, /watch\(action, \(\) => render\(\)\)/);
});

test("every attempt gets a fresh token, because Siteverify spends one on its first check", () => {
  assert.match(signIn, /onSettled: \(\) => turnstile\.reset\(\)/);
  assert.match(widget, /api\.reset\(id\)/);
});

test("the widget asks nothing of most people, and is off until a site key is set", () => {
  assert.match(widget, /appearance: "interaction-only"/);
  assert.match(widget, /render=explicit/);
  assert.match(config, /turnstileSiteKey: ""/);
  // Read from the Worker's own vars per request, so wrangler.jsonc (or .dev.vars) is the one place.
  assert.match(plugin, /env\?\.NUXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.match(plugin, /useRuntimeConfig\(event\)\.public\.turnstileSiteKey = key/);
  assert.match(widget, /if \(!enabled\) return;/);
});
