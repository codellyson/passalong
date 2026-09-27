# Security model

## The share key is the secret

A guide's id is an address; the key in `/g/:id/:key` is the authorisation. So it must never leave:
guide pages are `noindex`, `robots.txt` disallows `/g/`, `x-robots-tag` is set on the raw `.md`, team
channels get a built card instead of an unfurl, the unfurl cache is keyed without it, and analytics are
sent from the Worker with categorical props only — never an id, handle, title or URL.

## Pages that render someone else's markdown run no script

A guide page renders markdown a stranger wrote, and there is no sanitiser behind it — only the policy
`default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' https: data:`. That is the
product's one real security property. The landing, docs, FAQ, connect and blog get it too (`noScripts`).

Only `/hub`, `/join` and `/reset` run script, with a per-request nonce (`server/plugins/csp.ts`) —
never `'unsafe-inline'`.

## The hub frames guides, never renders them

The hub runs script and holds a token, so it shows a guide by framing its share page (`?embed=1`) in a
sandboxed same-origin iframe with no `allow-scripts`. Its policy gains `frame-src 'self'` and nothing
wider. Inside the frame every link opens a new tab, so nothing can navigate it. The service worker has
no fetch handler, so the pages it controls load exactly as without it.

## What else is load-bearing

- **Screenshots** are claimed only by the account that uploaded them — naming someone else's shot id
  cannot take it.
- **Checks never run a command read from a guide**, which would make every pull remote code execution.
- **Passwords**: PBKDF2 at the Worker's cap of 100,000 iterations, so a 12-character minimum and a Have
  I Been Pwned range check make up the difference, failing open.
- **Secrets are stored hashed**: tokens, session ids, reset codes.
- **Billing webhooks** are verified over the raw body before anything parses it.
- **Push** payloads are encrypted to the browser's keys; the push service cannot read them.

## Sources
- `apps/web/shared/csp.ts`, `server/plugins/csp.ts`, `app/pages/g/[id]/[key].vue`, `app/pages/hub/g/[id].vue`
- [docs/wiki/web-view.md](../wiki/web-view.md), [docs/wiki/auth.md](../wiki/auth.md)
- [AGENTS.md](../../AGENTS.md): "CSP on the web view", "Guide pages are noindex", "Analytics are sent from the Worker", "Password strength…", "A billing webhook…"
