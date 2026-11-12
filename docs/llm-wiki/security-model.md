# Security model

## The share key is the secret

Work's id is an address; the key in `/w/:id/:key` is the authorisation. So it must never leave:
share pages are `noindex`, `robots.txt` disallows `/w/`, `x-robots-tag` is set on the raw `.md`, team
channels get a built card instead of an unfurl, the unfurl cache is keyed without it, and analytics are
sent from the Worker with categorical props only — never an id, handle, title or URL.

## Pages that render someone else's markdown run no script

A share page renders markdown a stranger wrote, and there is no sanitiser behind it — only the policy
`default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' https: data:`. That is the
product's one real security property. The docs, FAQ, connect, /learn and blog get it too (`noScripts`). The landing runs script under the hub's per-request nonce policy (2026-10-30): it holds nothing anyone else wrote, so only the scripts the server emitted can run, and agents read `llms.txt` and the raw `.md` of a share link, never the landing. It also plays the launch film from this origin's own files, so the policy adds `media-src 'self'` and nothing wider (2026-10-31).
A shared project (`/p/:id/:key`) gets the same rule, `noindex` and a `robots.txt` disallow, and its
documents also go through the sanitising project renderer; its files are served as downloads only.
`apps/web/test/share-links.test.mjs` pins both prefixes to these rules.

Only `/hub`, `/join` and `/reset` run script, with a per-request nonce (`server/plugins/csp.ts`) —
never `'unsafe-inline'`.

## The hub frames work, never renders it

The hub runs script and holds a token, so it shows work by framing its share page (`?embed=1`) in a
sandboxed same-origin iframe with no `allow-scripts`. Its policy gains `frame-src 'self'` and nothing
wider. Inside the frame every link opens a new tab, so nothing can navigate it. The service worker
answers one request only, the phone's share (`POST /hub/share`), and keeps what was shared in the
browser for the signed-in box to upload; every other request it leaves alone, so the pages it
controls load exactly as without it.

## What else is load-bearing

- **Screenshots** are claimed only by the account that uploaded them — naming someone else's shot id
  cannot take it.
- **Checks never run a command read from a piece of work**, which would make every take remote code execution.
- **Passwords**: PBKDF2 at the Worker's cap of 100,000 iterations, so a 12-character minimum and a Have
  I Been Pwned range check make up the difference, failing open.
- **Secrets are stored hashed**: tokens, session ids, reset codes.
- **Turnstile** guards the hub's sign-up, sign-in and reset-email forms and nothing else: the CLI and
  MCP never meet a challenge. A token must match its form's action and the request's host, and a
  test-key answer counts only on localhost (`apps/api/src/turnstile.ts`).
- **Billing webhooks** are verified over the raw body before anything parses it.
- **Push** payloads are encrypted to the browser's keys; the push service cannot read them.
- **The owner's admin hub** reads accounts under `/v1/admin-hub` (admin-hub CONTRACT.md v1): the
  manifest, the list (email, name, plan, work count, last seen, status), one account with its token
  names, teams and suspension, and its activity from `work` and `task_event` rows. Every read checks
  a shared `ADMIN_SECRET`, compared in constant time, before reading; unset, they refuse everyone. A
  token's value or hash never leaves. Outside `/v1/admin/` because it is a server's secret, not an
  operator's session (`apps/api/src/admin-users.ts`).
- **The hub's writes** are one route, `POST /v1/admin-hub/users/:id/actions/:action`, signed with a
  second secret, `ADMIN_WRITE_SECRET`: an HMAC over method, path, timestamp, operator email and the
  **raw** body, read as text and verified before it is parsed, within a minute of now
  (`verifyHubRequest`, the hub's reference copied). The read secret signs nothing, so leaking it
  changes nothing. The session gate lets past exactly the GET read shapes and this one POST shape.
  The operator's email is the actor recorded. Actions: `signout`, `suspend`, `unsuspend`, `comp`.
- **Signing out everywhere** makes every credential useless: sessions deleted, API tokens revoked
  (kept, so Settings still lists them), connector tokens and unredeemed codes deleted, a CLI sign-in
  approved but not collected deleted, unused reset and upload links spent. Unsuspending restores
  none of it.
- **A suspended account** (`account.suspended_*`, migration 0085) is refused with 403 "This
  account is suspended." by the middleware on every path that turns something into an account: a
  session, an API token, a connector grant (so `/v1/mcp` too), and the app's own dispatch, which is
  how a choice link's pick and email in act. Sign-in refuses it after the password is checked, so
  only someone who knows the password learns it is suspended; a reset link is not sent, and one
  already sent is refused. It gets no product news. The hub can ask for a mail telling them.
- **Give plan** (`comp`) goes through `gift()` so its rules hold, above all that a gift never
  touches a plan someone pays for: that refusal reaches the hub as a 409. Solo goes to the person,
  Team to the one team they own. `plan_grant.by_account` must name an account, so the operator's
  email is matched to one; failing that the gift is recorded under the first `ADMIN_ACCOUNTS` id,
  the deployment's owner, with the operator's email in its reason, and with neither it is refused.
- **Deleting an account** (`delete`, `apps/api/src/delete-account.ts`) takes what was theirs
  alone: work in no team and sent to nobody else, their personal projects, a team only they are
  in with its work and projects, every screenshot and file on that work or never attached, the R2
  objects behind all three key layouts (`<id>.<ext>`, `files/<id>.<ext>`,
  `projects/<project>/<file>`), and every credential and personal row. What other people hold
  stays: work they wrote into a team or sent to someone, their thread lines and proof on other
  people's work, their edits to shared documents. Deleting those would delete the other people's
  history, and several foreign keys cascade or refuse. So the account row stays as an anonymous
  placeholder (migration 0086: email, name, handle and password cleared, `deleted_at` set, shown
  as "Deleted account", gone from the hub's reads), with its billing columns and gifts kept as the
  financial record. Refused with 409: owning a team with other members, a Solo plan still being
  paid for and not cancelled, an admin or the platform owner. A confirmation is mailed, best effort.

## Sources
- `apps/api/src/admin-users.ts`, `apps/api/migrations/0085_suspension.sql`, `apps/api/test/admin-actions.test.mjs`, `apps/api/src/delete-account.ts`, `apps/api/migrations/0086_account_deleted.sql`, `apps/api/test/delete-account.test.mjs`
- `apps/web/shared/csp.ts`, `server/plugins/csp.ts`, `app/pages/g/[id]/[key].vue`, `app/pages/hub/w/[id].vue`
- [docs/wiki/web-view.md](../wiki/web-view.md), [docs/wiki/auth.md](../wiki/auth.md)
- [AGENTS.md](../../AGENTS.md): "CSP on the web view", "Work pages are noindex", "Analytics are sent from the Worker", "Password strength…", "A billing webhook…"
