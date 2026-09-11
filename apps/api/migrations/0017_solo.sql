-- The Solo plan: a subscription that belongs to a person rather than to a team.
--
-- The landing page has been selling this since the pricing went up, and nothing could buy it. Every
-- subscription route was `/v1/teams/:slug/subscribe`, owner-only, so an individual who wanted to
-- pay had to invent a team of one first — and `FREE_SIGNUP` could never be closed, because closing
-- it would have left a new account able to create itself and do nothing else.
--
-- Shaped exactly like `team.plan` (migration 0015), deliberately: one column, three values, none of
-- which can be stored in a combination that means nothing.
--
--   free    the default, and what every account created before this migration is. What it may sync
--           is then decided by `grandfathered` and `FREE_SIGNUP` — see quota.ts.
--   solo    paid and current. This account syncs without a ceiling.
--   lapsed  it was paid and is not now. It falls back to whatever `free` would have given it,
--           which for an account that predates the cutover is its grandfathered ceiling and for
--           everyone else is nothing. Its guides are never touched.
--
-- `solo` rather than reusing `team` as the value: they are the same capability bought two different
-- ways, and a column that cannot say which was bought is one that cannot answer "why does this
-- account have no ceiling" without going and looking at four other tables.
ALTER TABLE account ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';

-- The provider's handle on the subscription, so a webhook can find the account it is about. Same
-- reasoning as `team.subscription_id`: opaque, not unique, and worth nothing to us once it is over.
ALTER TABLE account ADD COLUMN subscription_id TEXT NOT NULL DEFAULT '';

-- When the current plan value was last set. Not a billing record — the provider owns that — but the
-- answer to "since when?" on a support question, which is otherwise unanswerable.
ALTER TABLE account ADD COLUMN plan_since TEXT NOT NULL DEFAULT '';

-- A webhook arrives knowing only a subscription id and has to find its subject in one query.
CREATE INDEX account_subscription ON account(subscription_id);
