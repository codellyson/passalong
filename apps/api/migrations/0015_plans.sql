-- The paid tier. §11 makes the team the thing that is bought and the solo tier the distribution
-- engine, so the plan belongs to the team and not to the person: a seat is bought for somebody, and
-- the account it lifts may never have paid for anything.
--
-- ONE COLUMN, THREE VALUES, rather than a plan beside a status. `free` + `lapsed` is not a state
-- anything should be able to store — a team that never subscribed cannot stop paying — and two
-- columns can express it, which means one day something will. The three states each map to exactly
-- one set of capabilities:
--
--   free    the default, and what every team created before this migration is. Members keep their
--           own free-tier ceiling; nothing about the team lifts it.
--   team    paid and current. Every member publishes without a ceiling, including members who have
--           never paid for anything, and `seats` is enforced when somebody joins.
--   lapsed  it was paid and it is not now. The team goes read-only: no new guide may be addressed
--           to it and nobody new may join, while everything already in it stays readable, pullable
--           and answerable. Members fall back to their own free ceiling.
--
-- Read-only rather than hidden, because `docs/PRD.md` §10 promises no lock-in and a team's guides
-- are its members' own work. Withholding them to collect a debt is the thing that principle exists
-- to forbid. What lapsing stops is new work flowing *in*; what it must never stop is work already
-- in flight closing — a verdict and an ack are the reader's, not the owner's, and a reader who was
-- handed a guide last week is not the person who missed a payment.
ALTER TABLE team ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';

-- How many members the plan is paid for. Zero is the only correct value for a team on `free`: it is
-- not "no seats", it is "seats are not the thing limiting this team", which is why the check reads
-- the plan first and the number second. Enforced where somebody joins, never at checkout — a seat
-- that is only counted when it is bought is a seat count that drifts the first time anyone leaves.
ALTER TABLE team ADD COLUMN seats INTEGER NOT NULL DEFAULT 0;

-- The provider's handle on the subscription, so a webhook can find the team it is about. Empty for
-- a team that has never subscribed. Deliberately opaque and deliberately not unique: a team that
-- cancels and comes back has a new one, and the old value is worth nothing to us.
ALTER TABLE team ADD COLUMN subscription_id TEXT NOT NULL DEFAULT '';

-- When the current plan value was last set. Not a billing record — the provider owns that history —
-- but the answer to "since when?" on a support question, which is otherwise unanswerable.
ALTER TABLE team ADD COLUMN plan_since TEXT NOT NULL DEFAULT '';

-- Every quota check asks the same question: is this account in a team that is currently paid? That
-- is a lookup by account, across memberships, filtered by plan.
CREATE INDEX membership_account_team ON membership(account_id, team_id);
