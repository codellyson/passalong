-- Accounts are tokens. No email or password in v1: `relay login` mints one, and pasting the
-- token on another machine attaches it. Only the hash is stored.
CREATE TABLE account (
  id         TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created    TEXT NOT NULL
);

-- The guide's markdown is the source of truth; the other columns are denormalized from its
-- frontmatter so list/search never has to parse every document.
CREATE TABLE guide (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  share_key      TEXT NOT NULL,
  title          TEXT NOT NULL,
  status         TEXT NOT NULL,
  source_context TEXT NOT NULL DEFAULT '',
  tags           TEXT NOT NULL DEFAULT '[]',
  stack          TEXT NOT NULL DEFAULT '[]',
  markdown       TEXT NOT NULL,
  created        TEXT NOT NULL,
  updated        TEXT NOT NULL,
  pulls          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX guide_account_created ON guide(account_id, created DESC);
