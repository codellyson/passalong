# Web view

`apps/web` is a Nuxt 4 app on a Cloudflare Worker. It serves every page a person looks at, and
mounts the Hono app from `apps/api` for the machine routes. There is no editor, and guide pages run
no script at all.

## The constraint everything else follows from

A guide page renders **markdown one person wrote, for another person to read**. That is a hostile
shape. Rather than trusting a sanitiser, the page's CSP makes anything script-like inert:

```
default-src 'none'; style-src 'self'; font-src 'self';
img-src 'self' https: data:; manifest-src 'self'; base-uri 'none'; form-action 'none'
```

Note what is missing: there is no `script-src` at all. That is only possible because `/` and `/g/**`
carry the **`noScripts` route rule** (`nuxt.config.ts`), which drops Nuxt's entry script, its import
map, the inlined payload and the JS resource hints. The page still server-renders; it simply never
hydrates, so nothing on those routes may be interactive.

`/hub`, `/join/:code` and `/reset` do need script. Their header is written **per response** by
`server/plugins/csp.ts`, which stamps a fresh nonce on every inline `<script>` the renderer emits
and names that nonce in the policy. A nonce, not `'unsafe-inline'` — the latter would allow any
injected script, which is the thing the header exists to prevent. Both policies live in
`shared/csp.ts`.

Why a nonce is needed here and was not before the port: the old hand-written pages loaded one
external file and had no inline script anywhere. Nuxt emits a `window.__NUXT__.config` bootstrap
that a flat `script-src 'self'` refuses — the page renders and then hydration dies with
`Cannot read properties of undefined`. `experimental.entryImportMap: false` removes the other one.

Two settings are load-bearing and cannot be checked with `nuxt dev`, because a development build
ships scripts and inlines styles whatever the config says:

- `features.inlineStyles: false` — the stylesheet must arrive as a `<link>`, since `style-src
  'self'` refuses an inline `<style>`.
- the `noScripts` route rule.

`apps/web/scripts/probe.sh` asserts both against a deployed response. Run it after any change to
either:

```sh
sh apps/web/scripts/probe.sh https://passalong.dev
sh apps/web/scripts/probe.sh https://passalong.dev /g/<id>/<key>
```

`font-src 'self'` is the reason the site can have typography at all: with `default-src 'none'` and
no `font-src`, the browser blocks even a same-origin woff2, which silently pinned the whole site to
system fonts.

## Styles

`app/assets/css/styles.css` is the only stylesheet. Design tokens at the top — a 4px spacing scale,
a type scale, `--surface` / `--surface-raised`, `--motion` — and everything composes from them.

It goes through the build, so it is content-hashed and immutably cached. The old hand-bumped `?v=`
is gone; there is nothing to remember after a CSS change.

One thing to know before editing it: **it is lint-clean under `biome check`, including
`noDescendingSpecificity`.** Leaf overrides live in a section at the bottom. A new `.x h2`-shaped
rule added mid-file will usually trip that rule, and the fix is ordering, not `!important`.

Fonts are self-hosted in `public/fonts/`. Two variable woff2 faces, latin subset: Instrument Sans
carries the interface, Source Serif carries guide prose (`article.prose`), where the reading is long
enough to earn a serif. **The `.ttf` pair beside them is not dead weight** — see OG cards below.

## What a guide page does

`app/pages/g/[id]/[key].vue` produces two views of the same markdown:

- **Full guide** — the whole thing, rendered in order.
- **Verify** (`?view=verify`) — leads with what the reader has to check and folds the
  implementation into a `<details>`. `verifyLayout()` in `apps/api/src/guide.ts` decides what leads
  and what folds; `server/utils/guide-html.ts` only turns that into HTML.

A guide with no `Verification` section gets a note saying so. That is a feature: silently rendering
it would hide the fact that nobody can tell whether it worked.

It is a link, not a toggle, because these pages run no script.

`marked` lives in the server util rather than the page, so it never enters the client bundle of a
page that ships no client bundle.

## The hub

`/hub` serves two different screens — signing in, and the hub itself — and neither credential is
visible from the server: the session cookie is HttpOnly and the bearer token lives in
`localStorage`. So nothing is fetched during SSR. The first render is always the signed-out screen,
and the client decides from there. Each state renders its own framing; there is no server-rendered
heading that could describe only one of them, which is how a signed-out visitor once came to be
told these were "Your transfers".

`app/composables/useHub.ts` holds the state and every mutation. Status changes **reload rather than
patch state by hand**: the board's buckets are defined in SQL, and guessing them on the client is
how the two drift apart.

The page's `<noscript>` goes in through `useHead`, not the template. A browser with script *enabled*
parses the contents of `<noscript>` as plain text, while Vue's server render emits it as markup — so
hydration finds a text node where it expected a `<p>`. That is a real mismatch and it only shows up
in the dev console.

## OG cards

`apps/api/src/og.ts`, served at `/g/:id/:key/og.png` through the mount. A guide travels by being
pasted into Slack or a DM, so the unfurl card is the first thing most people see of one.

- `workers-og` (satori + resvg) is ~1.7MB of JS and wasm, so it is behind a **dynamic import** —
  every other route on the Worker would otherwise pay for it on a cold start. Bundling it at all
  requires `nitro.experimental.wasm`; without that the build dies trying to parse the `.wasm` as
  JavaScript.
- Satori cannot read woff2, so the renderer loads the `.ttf` pair from `apps/web/public/fonts/`
  through the `ASSETS` binding, cached per isolate. **Nothing else references those two files**, so
  they look unused and are not — deleting them returns 500 on every unfurl card, which is exactly
  what happened once during the port.
- Satori's parser does **not decode HTML entities** — write literal characters, or `&nbsp;` renders
  as those six.
- The card is light-palette only. It is composited on someone else's background, so following the
  server's colour scheme would be a coin flip.

## Hosts

`apps/api/src/hosts.ts` decides which hostnames serve. `passalong.dev` is canonical; `www` 308s to
it; `passalong.kreativekorna.com` still serves, because share keys live in the URL and links handed
out under the old host must keep resolving.

Serving an old link and creating a new one are different jobs, and only the first is worth keeping.
`origin()` used to build each link from the host that served it, which meant the old host minted
share links, invites, resets and screenshot URLs under its own name — one guide with two links,
each carrying a key, which is exactly what the `www` redirect exists to prevent. `PUBLIC_ORIGIN`
now names the apex, so both hosts produce the same link and only the apex appears in anything new.

Plain `http` on either serving host 308s to `https` on the same host, so a legacy link stays on
the legacy host. The scheme comes from `x-forwarded-proto` (or `cf-visitor`), never from the request
URL: the runtime may rebuild that URL as `http:` for an https visitor, and believing it would
redirect every request to itself.

Search engines see only the apex. The landing and `/connect` pass `url` to `usePage()` with `APEX`
from `hosts.ts`, which emits their canonical link, so the legacy host's copies point home.
`/sitemap.xml` lists the same two pages, and `robots.txt` names it.

The redirect runs from `apps/web/server/middleware/0.canonical.ts`, not from Hono. It had to move
there at the cutover: the mounted app only ever sees `/v1/*`, `/health` and the two machine routes,
so a page request to `www` would never have reached a middleware inside it.

The logic stays a leaf module rather than inline middleware for a testability reason worth knowing:
`wrangler dev` rewrites both the Host header and the request URL to localhost, so a host-based
redirect **cannot be exercised with a local curl**. It needs a unit test, and `hosts.ts` has one.
