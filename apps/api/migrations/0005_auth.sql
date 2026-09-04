-- Real accounts. Until now the account *was* the token: one secret, no recovery, and no way to
-- revoke it without losing everything attached to it. That fits a CLI and nothing else — a tester
-- cannot keep a bearer token safe, and a leaked one could not be rotated.
--
-- So identity moves to email + password, the browser gets a session cookie, and tokens become what
-- they should always have been: named, revocable credentials minted for a CLI or an MCP server.
-- Anonymous accounts still exist (`POST /v1/accounts` backs `passalong login` and invite links);
-- they are simply accounts nobody has claimed yet.

-- Named, revocable API credentials. Only the SHA-256 is stored; the plaintext is shown once.
CREATE TABLE token (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  hash       TEXT NOT NULL UNIQUE,
  created    TEXT NOT NULL,
  last_used  TEXT NOT NULL DEFAULT '',
  revoked    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX token_account ON token(account_id, created DESC);

-- Browser sessions. Hashed like tokens: a session id in a cookie is a bearer credential too.
CREATE TABLE session (
  hash       TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  created    TEXT NOT NULL,
  expires    TEXT NOT NULL
);
CREATE INDEX session_account ON session(account_id);

-- Single-use password reset links, so a forgotten password is not a lost account.
CREATE TABLE reset (
  hash       TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  created    TEXT NOT NULL,
  expires    TEXT NOT NULL,
  used       TEXT NOT NULL DEFAULT ''
);

-- Every token that exists today keeps working, as a named row people can now see and revoke.
INSERT INTO token (id, account_id, name, hash, created)
SELECT lower(hex(randomblob(5))), id, 'CLI (existing)', token_hash, created FROM account;

-- `account.token_hash` stays, unused.
--
-- Dropping it needs a table rebuild, because SQLite refuses DROP COLUMN on a UNIQUE column. That
-- rebuild is not safe here: every child table references account(id), most with ON DELETE CASCADE,
-- so DROP TABLE account either deletes every guide, membership, notification and verdict, or fails
-- on team.created_by, which has no cascade. `PRAGMA defer_foreign_keys` does not rescue it — the
-- constraint still fails at commit and D1 rolls the whole thing back. Tested, both ways.
--
-- So the column is retired in place. Nothing reads it; new accounts write a "retired:" marker that
-- can never equal a SHA-256. Removing it properly belongs in a maintenance script that can turn
-- foreign keys off, not in a migration.
ALTER TABLE account ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';

-- Email is the login identifier once set, so it must be unique — but it stays optional, because
-- an anonymous or invite-created account has none yet.
CREATE UNIQUE INDEX account_email ON account(email) WHERE email <> '';
