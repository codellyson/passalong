-- Everybody who is already here keeps what they signed up under.
--
-- The landing page now sells Solo and there is no free tier on it. That is a decision about people
-- who have not arrived yet; it is not a thing to do to accounts that have been syncing guides for
-- months under a different promise. `docs/PRD.md` §10 is about not taking your content away, and
-- silently dropping somebody's ceiling to zero is the same act with extra steps.
--
-- A column rather than a date comparison. "Created before 2026-09-11" would work exactly once and
-- then sit in the code forever as a magic timestamp nobody can safely change, and the day the
-- cutover moves it is wrong everywhere at once. This is written once, by the UPDATE below, and is
-- afterwards a plain fact about an account that anyone can read, set or clear.
ALTER TABLE account ADD COLUMN grandfathered INTEGER NOT NULL DEFAULT 0;

-- Every account that exists at the moment this runs. New rows default to 0 and are subject to
-- whatever the plans say — which is the whole point of doing this now rather than later: "existing"
-- only means something while it is still true.
UPDATE account SET grandfathered = 1;
