// The response headers, in one place. `apps/api/src/index.ts` had these as two object literals
// spread onto every `c.html()` call; here nuxt.config.ts hands them to route rules and
// server/plugins/csp.ts rebuilds the scripted one per request with a nonce.

/** Shared by every page, script or no script. */
const BASE = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

/**
 * Guide pages and the landing: no script at all. This is `VIEW_HEADERS` from apps/api, unchanged,
 * and it is the product's one real security property — a guide page renders markdown a stranger
 * wrote, and there is no sanitiser behind this, only the CSP. Pair it with the `noScripts` route
 * rule; without that Nuxt emits a bootstrap script the policy will (correctly) refuse.
 */
export const VIEW_HEADERS = {
  ...BASE,
  "content-security-policy":
    "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' https: data:; manifest-src 'self'; base-uri 'none'; form-action 'none'",
};

/**
 * The hub, the invite page and the password reset, which do run script.
 *
 * apps/api could write `script-src 'self'` flatly, because its pages loaded one external file and
 * had no inline script anywhere — that is why Preact was vendored rather than pulled from a CDN.
 * Nuxt emits one inline bootstrap (`window.__NUXT__.config = …`) that `'self'` alone refuses, so
 * the policy names a per-request nonce instead. `'self'` still governs the external chunks; the
 * nonce only widens the policy to the one tag the server itself wrote.
 *
 * Not `'unsafe-inline'`: that would allow any injected script on the page, which is the thing the
 * header exists to prevent.
 */
export const hubHeaders = (nonce: string, dev = false) => ({
  ...BASE,
  "content-security-policy":
    `default-src 'none'; script-src 'self' 'nonce-${nonce}'; script-src-elem 'self' 'nonce-${nonce}'; ` +
    // Vite serves stylesheets as injected inline <style> blocks in development, so the production
    // policy leaves `nuxt dev` completely unstyled — which reads as a broken app rather than as a
    // header doing its job. The build is what ships, and it is checked by scripts/probe.sh.
    `style-src 'self'${dev ? " 'unsafe-inline'" : ""}; ` +
    // `ws:` is the dev server's HMR socket; nothing else on the page opens one.
    `font-src 'self'; connect-src 'self'${dev ? " ws:" : ""}; img-src 'self'; ` +
    // A guide's page in the hub shows the guide by framing its own share page, which runs no
    // script and carries VIEW_HEADERS. That is the only frame, and it is this origin: the hub never
    // turns a stranger's markdown into its own HTML, because the hub runs script.
    "frame-src 'self'; " +
    "manifest-src 'self'; base-uri 'none'; form-action 'none'",
});
