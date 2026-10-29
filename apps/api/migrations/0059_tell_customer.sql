-- Whether a team is reminded to tell a customer when a fix made from their request is done
-- (docs/LOOP.md §1a: opt-in per team, off unless an owner turns it on).
ALTER TABLE team ADD COLUMN tell_customer INTEGER NOT NULL DEFAULT 0;
