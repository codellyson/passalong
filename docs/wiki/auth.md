# Auth

`apps/api/src/auth.ts`. Three credentials, one rule: **only hashes are stored** — of passwords,
tokens, session ids and reset codes alike. A database dump should let nobody in.

## Passwords

PBKDF2-SHA256 at 100,000 iterations, which is the Workers runtime's ceiling. The record is
`pbkdf2$<iterations>$<salt>$<hash>`, so the cost is stored per password: raising it later, or
moving to another KDF, can happen per account on next sign-in without invalidating anyone.

`passwordProblem()` is the whole policy:

- at least `MIN_PASSWORD` (8) characters — NIST SP 800-63B's floor
- at most 200
- not only spaces

No character classes. Length and a breach check do more than a zoo of required symbols, and the
rule does not announce itself in the UI: there is no length hint and no `minlength`, because that
pushes policy at someone before they have done anything wrong. The error appears on submit, in the
form's own styled error element.

`isBreached()` checks Have I Been Pwned's Pwned Passwords range API: the first five characters of
the SHA-1 are sent, never the password, with `add-padding: true` so response sizes leak nothing.
**A network failure means not breached** — the check fails open, because refusing to let someone
sign up when a third party is down is worse than accepting one weak password.

## Tokens

`pa_…`, minted by `passalong login` and by `POST /v1/tokens`. Shown once; only `sha256` is kept.
Used by the CLI and by MCP servers, so a password never goes near a terminal. Named and revocable
from the hub — `last_used` is recorded so a stale one is identifiable.

## Sessions

`pa_session` cookie: `HttpOnly; SameSite=Lax; Path=/`, 30 days, and `Secure` **except** on plain
http so `wrangler dev` on localhost can hold a session. No `Domain` attribute, so it is host-only
and does not leak to subdomains.

Signing in through the hub drops any pasted token: the cookie is the credential from that point,
and a stale bearer header would otherwise keep authenticating as whoever that token belongs to.

## Reset codes

Emailed, single-use, one hour. The code rides in the URL **fragment**, which is never sent to the
server and so never lands in a log — the same trick `passalong hub` uses for the token. Changing a
password signs out every other session on the account.

`POST /v1/auth/forgot` answers identically whether or not the address exists. Keep it that way; a
different response is an account-existence oracle.

## What each credential can do

| | Read guides | Publish | Manage tokens | Change password |
| --- | --- | --- | --- | --- |
| Share link (`/g/:id/:key`) | that one guide | no | no | no |
| Bearer token | yes | yes | yes | yes |
| Session cookie | yes | yes | yes | yes |

There is no read-only credential. A share link is the closest thing, and it is per guide.
