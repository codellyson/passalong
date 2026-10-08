-- Signing the CLI in from the browser, so no password is typed into a terminal and no token is
-- pasted between two windows.
--
-- The CLI starts a login and gets a short code to show; a signed-in person opens a page, sees the
-- code and says yes; the CLI, polling, is then handed a token. The token is made at that last step
-- and not stored here: `challenge` is the sha256 of a secret only the CLI holds, so what sits in
-- this table for ten minutes is enough to recognise the right caller and not enough to be one.
CREATE TABLE device_login (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  challenge  TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  created    TEXT NOT NULL,
  expires    TEXT NOT NULL,
  account_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX device_login_expires ON device_login(expires);
