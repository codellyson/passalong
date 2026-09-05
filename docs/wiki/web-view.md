# Web view

`apps/api/src/render.ts` turns guides into HTML; `apps/api/public/` holds everything static. There
is no editor and no framework on guide pages — they run no script at all.

## The constraint everything else follows from

A guide page renders **markdown one person wrote, for another person to read**. That is a hostile
shape. Rather than trusting a sanitiser, the view's CSP makes anything script-like inert:

```
default-src 'none'; style-src 'self'; font-src 'self';
img-src 'self' https: data:; manifest-src 'self'; base-uri 'none'; form-action 'none'
```

`/hub`, `/join/:code` and `/reset` need script, so they get `HUB_HEADERS` — the same policy plus
`script-src 'self'` and `connect-src 'self'`. They render no user-authored markdown, only a team
name, which is why they can afford it.

Do not loosen either to add an inline style or a CDN script. Styles go in `public/styles.css`;
JavaScript goes in a file under `public/` and is loaded as a module.

`font-src 'self'` is the reason the site can have typography at all: with `default-src 'none'` and
no `font-src`, the browser blocks even a same-origin woff2, which silently pinned the whole site to
system fonts.

## Styles

`public/styles.css` is the only stylesheet. Design tokens at the top — a 4px spacing scale, a type
scale, `--surface` / `--surface-raised`, `--motion` — and everything composes from them.

Two things to know before editing it:

1. **Bump `STYLES` in `render.ts` after any change.** The sheet is browser-cached for an hour
   (`public/_headers`); a stale one silently breaks new pages. It has shipped unstyled to returning
   visitors before.
2. **It is lint-clean under `biome check`, including `noDescendingSpecificity`.** Leaf overrides
   live in a section at the bottom. A new `.x h2`-shaped rule added mid-file will usually trip that
   rule, and the fix is ordering, not `!important`.

Fonts are self-hosted in `public/fonts/` — two variable woff2 faces, latin subset. Instrument Sans
carries the interface, Source Serif carries guide prose (`article.prose`), where the reading is long
enough to earn a serif. Not a CDN, for the same reason Preact is vendored.

## What a guide page does

`renderGuide()` produces two views of the same markdown:

- **Full guide** — the whole thing, rendered in order.
- **Verify** (`?view=verify`) — leads with what the reader has to check and folds the
  implementation into a `<details>`. `verifyLayout()` in `guide.ts` decides what leads and what
  folds; `render.ts` only turns that into HTML.

A guide with no `Verification` section gets a note saying so. That is a feature: silently rendering
it would hide the fact that nobody can tell whether it worked.

It is a link, not a toggle, because these pages run no script.

## The hub

`/hub` serves two different screens — signing in, and the hub itself — and auth state lives in a
cookie the client reads. So `renderHub()` emits **no heading at all**: a server-rendered header
could only describe one of them, which is how a signed-out visitor came to be told these were
"Your transfers". Each state renders its own framing in `public/hub.js`.

Preact + htm, vendored into `public/vendor/` by `scripts/vendor.mjs`. No bundler: htm's tagged
templates need no transpiling, so the file in `public/` is the code that runs.

## OG cards

`src/og.ts`, served at `/g/:id/:key/og.png`. A guide travels by being pasted into Slack or a DM, so
the unfurl card is the first thing most people see of one.

- `workers-og` (satori + resvg) is ~1.7MB of JS and wasm, so it is behind a **dynamic import** —
  every other route on this Worker would otherwise pay for it on a cold start.
- Satori cannot read woff2, so the OG renderer loads the `.ttf` pair from `public/fonts/` through
  the `ASSETS` binding, cached per isolate. They are not bundled.
- Satori's parser does **not decode HTML entities** — write literal characters, or `&nbsp;` renders
  as those six.
- The card is light-palette only. It is composited on someone else's background, so following the
  server's colour scheme would be a coin flip.

## Hosts

`src/hosts.ts` decides which hostnames serve. `passalong.dev` is canonical; `www` 308s to it;
`passalong.kreativekorna.com` still serves, because share keys live in the URL and links handed out
under the old host must keep resolving.

The logic is a leaf module rather than inline middleware for a testability reason worth knowing:
`wrangler dev` rewrites both the Host header and `c.req.url` to localhost, so a host-based redirect
**cannot be exercised with a local curl**, and `src/index.ts` is not importable from a Node test
(it imports siblings as `./x.js`, which type stripping cannot resolve).
