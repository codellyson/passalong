-- Whether a team's support address answers a new request with an email saying it arrived, with its
-- tracking number, and in the team's own words when the owner wrote some ('' is the default line).
-- Off unless the team's owner turns it on, from the Support page: a team decides what its customers
-- hear (2026-11-03).
ALTER TABLE team ADD COLUMN ack_customer INTEGER NOT NULL DEFAULT 0;
ALTER TABLE team ADD COLUMN ack_text TEXT NOT NULL DEFAULT '';
