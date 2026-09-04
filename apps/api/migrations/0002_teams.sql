-- M2: the team layer. Accounts gain an identity (handle/name/email) so a guide can be addressed
-- to a person; teams are the unit of sharing; pulls are recorded per account so the sender can
-- see whether a transfer landed.

ALTER TABLE account ADD COLUMN handle TEXT NOT NULL DEFAULT '';
ALTER TABLE account ADD COLUMN name   TEXT NOT NULL DEFAULT '';
ALTER TABLE account ADD COLUMN email  TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX account_handle ON account(handle) WHERE handle <> '';

CREATE TABLE team (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES account(id),
  created    TEXT NOT NULL
);

CREATE TABLE membership (
  team_id    TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',
  joined     TEXT NOT NULL,
  PRIMARY KEY (team_id, account_id)
);
CREATE INDEX membership_account ON membership(account_id);

-- Invites are links. `email` is only where the link was sent, when it was.
CREATE TABLE invite (
  code       TEXT PRIMARY KEY,
  team_id    TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  email      TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created    TEXT NOT NULL,
  used_by    TEXT NOT NULL DEFAULT '',
  used       TEXT NOT NULL DEFAULT ''
);

-- A guide can live in a team (every member can find and pull it) and be addressed to one member.
ALTER TABLE guide ADD COLUMN team_id       TEXT NOT NULL DEFAULT '';
ALTER TABLE guide ADD COLUMN to_account_id TEXT NOT NULL DEFAULT '';
CREATE INDEX guide_team_created ON guide(team_id, created DESC);
CREATE INDEX guide_to ON guide(to_account_id);

-- Who pulled what, and how. `account_id` is empty for anonymous share-link pulls.
CREATE TABLE pull (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guide_id   TEXT NOT NULL REFERENCES guide(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL DEFAULT '',
  via        TEXT NOT NULL,
  at         TEXT NOT NULL
);
CREATE INDEX pull_guide_at ON pull(guide_id, at DESC);
CREATE INDEX pull_account ON pull(account_id, guide_id);
