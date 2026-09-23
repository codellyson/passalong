-- A plan given rather than bought, and the date it runs out.
--
-- Comping somebody — a design partner, a friend, putting a support problem right — was an UPDATE
-- typed against the production database. That works exactly once and records nothing: who gave it,
-- why, and above all until when. A comp with no end date is not generous, it is forgotten, and the
-- only way to find one afterwards is to notice the row.
--
-- TWO PARTS, AND THEY ANSWER DIFFERENT QUESTIONS. `plan_until` sits beside `plan` and is read on
-- every request: it is what makes a gift end. `plan_grant` is the record of the act, which no
-- request reads — it answers "why does this account have Solo", months later, when nobody
-- remembers. Keeping the record out of the hot column is deliberate: the plan stays one value with
-- one meaning, exactly as migrations 0015 and 0017 argued.
--
-- EMPTY MEANS NO END, and that is what a bought subscription has. A provider owns when a paid plan
-- stops; a webhook says so when it happens. So the webhook path clears `plan_until`, and expiry can
-- never cut short something somebody is paying for.
ALTER TABLE account ADD COLUMN plan_until TEXT NOT NULL DEFAULT '';
ALTER TABLE team ADD COLUMN plan_until TEXT NOT NULL DEFAULT '';

-- One row per act of giving, kept after it ends. `revoked` is set rather than the row deleted: the
-- question a comp raises later is "what did we give this account, and what happened to it", and a
-- deleted row answers neither half.
--
-- `subject_kind` rather than two tables or two nullable columns: a gift is to an account (Solo) or
-- to a team (Team), the two are never both, and the pair is the natural key of what was given.
CREATE TABLE plan_grant (
  id           TEXT PRIMARY KEY,
  subject_kind TEXT NOT NULL,                  -- 'account' or 'team'
  subject_id   TEXT NOT NULL,
  plan         TEXT NOT NULL,                  -- 'solo' for an account, 'team' for a team
  seats        INTEGER NOT NULL DEFAULT 0,     -- team gifts only; 0 elsewhere
  until        TEXT NOT NULL,                  -- when it stops. Never empty: a gift ends.
  why          TEXT NOT NULL DEFAULT '',
  by_account   TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  at           TEXT NOT NULL,
  revoked_at   TEXT NOT NULL DEFAULT ''
);

-- The two reads this table has: everything given to one subject, and the list, newest first.
CREATE INDEX plan_grant_subject ON plan_grant(subject_kind, subject_id);
CREATE INDEX plan_grant_at ON plan_grant(at DESC);
