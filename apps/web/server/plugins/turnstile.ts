// The Turnstile site key, from the Worker's own variables into this request's public runtime
// config, which is what the page is rendered with (app/composables/useTurnstile.ts reads it).
//
// Nuxt fills runtime config from `process.env`, and the Worker's vars only reach that in a deployed
// Worker; `nuxt dev` keeps `.dev.vars` in the platform proxy's env instead. Reading the binding here
// means the key is set in one place, NUXT_PUBLIC_TURNSTILE_SITE_KEY in wrangler.jsonc's vars (or
// .dev.vars), and both behave the same. A build-time value still wins when there is no binding.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("request", (event) => {
    const env = (event.context.cloudflare as { env?: Record<string, unknown> } | undefined)?.env;
    const key = env?.NUXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (typeof key === "string" && key) useRuntimeConfig(event).public.turnstileSiteKey = key;
  });
});
