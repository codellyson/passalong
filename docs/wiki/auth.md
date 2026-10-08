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

`pa_…`, minted by `POST /v1/tokens` and by `POST /v1/accounts`. Shown once; only `sha256` is kept.
Used by the CLI and by MCP servers. Named and revocable from the hub — `last_used` is recorded so a
stale one is identifiable.

`passalong login` signs in from the browser (migrations/0043_device_login.sql): the CLI shows a short
code and opens `/device`, a signed-in person compares the page's code with the terminal's and
approves, and the CLI, polling, is handed a token named for the machine. The token is made at that
last step and never stored: the row holds only the sha256 of a secret the CLI keeps, so what is in
the table for ten minutes can recognise the right caller and cannot be one. It needs no terminal to
ask on, so an agent can start it and tell the person which page to open. `passalong login --email`
keeps the old way: an email and a password typed once and never stored. Either way the thing kept on
disk is a credential that can be revoked from the hub without changing it. It used to mint an anonymous
account instead — no email, no password — which meant the CLI quietly made accounts that could only
ever be reached from the one file they were written to. `POST /v1/accounts` still makes those, for
the invite page, which mints before it claims — and only when the body names an invite that has
not been used. Open, it made 96 accounts in two days from callers that were not people, none with
an email or a published guide.

## Several accounts on one machine

The CLI's config keeps logins by name under `accounts`, with `active` naming the default;
`token`, `api` and `team` at the top of the file stay a copy of the active one, so older readers
and older CLIs sharing the directory keep working. A call is made as, in order: `PASSALONG_TOKEN`,
`PASSALONG_ACCOUNT` or `--as` or `use_account` (this process only), then the default. With two or
more logins and nobody having said which, a person at a terminal gets the default; a process with
no terminal (an agent, the MCP server) is refused with the names and told to ask the person. The
refusal is the prompt, because an agent cannot be asked a question but can be told to put one. The
SessionStart hook says it at the start of a session. The server knows nothing of this: they are
separate accounts, and the CLI chooses which token to send. `team` is kept per account.

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
