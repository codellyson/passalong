# Teams and plans

**An account is not the product; a team is.** The hub of an account with no team is empty until
someone hands it something, which is why sign-in offers an invite paste before account creation.

## Addressing

Inside a team, `to:` is one of three, and the inbox ranks them in this order:

1. `@handle` — one person. Someone chose you.
2. `#group` — the people who do a thing (`team_group`, `group_member`). Every member sees it as
   addressed to them (`for_me`). One member taking it, an agent holding it, or a verdict clears it
   from the others — never from someone named by handle, nor from someone who said "on it". That
   rule is `ANSWERED_ELSEWHERE` in claims.ts, read by the inbox and sent on every guide row as
   `answered_elsewhere`, so the board and the guides page agree. Everyone in the team sees it on the
   board; only the group is told it is for them.
3. absent — the whole team. Chose nobody.

Every surface that shows the lane says which kind each guide is, because the order is only honest if
its reason is visible. Groups are addresses, not permissions.

## Plans

What an account may sync is a **name**, not a number: `unlimited` (a seat on a paid team, or Solo),
`free` (a ceiling — the only case where the number means anything), `none` (nothing syncs). It was
one integer where 0 meant unlimited, and the day "may sync nothing" arrived, both zeroes read as
unlimited.

- **Team** is $20 a month for up to 10 seats and lifts whoever sits in it; bigger teams are set up by hand. Seats are counted where somebody joins, not at
  checkout. A plan belongs to the team; an account's ceiling is derived from it on every read, never
  copied onto the account.
- **Solo** is one person's plan (`account.plan`), for someone who would otherwise invent a team of one.
- **Free** is open to new accounts in production (`FREE_SIGNUP` is `"1"`, reopened 2026-10-08; it was closed from 2026-09-11 and the wall it made is why). It is a ceiling of `FREE_SYNC_LIMIT` synced guides; accounts that existed before the cutover keep theirs either way.
- **Lapsed is read-only, not dark.** New work stops flowing in; nothing already there is withheld,
  and verdicts and acks keep working — they belong to the reader, not the person who missed a payment.
- **Checkout is hosted** by Bachs, a merchant of record, and its billing page is where a payer changes
  a card or cancels; the webhook, verified over the raw body, is what writes a plan, and an event
  older than the stored plan is dropped. Test or live is read off the key itself.
- **Gifts** end on their date, and never touch a subscription.

## Roles

`account.role` is `''` or `super` — whoever runs Passalong, at `/admin`. Only an account the
deployment names in `ADMIN_ACCOUNTS` may make or remove a super.

## Sources
- `apps/api/src/quota.ts`, `apps/api/src/billing.ts`, `apps/api/src/gifts.ts`
- [AGENTS.md](../../AGENTS.md): "Teams (M2)", "Three addresses…", "A plan belongs to a team…", "What an account may sync is a name…", "The checkout is hosted…"
- [docs/PRD.md](../PRD.md) §11
