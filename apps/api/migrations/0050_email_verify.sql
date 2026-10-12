-- Email verification. `email_verified` is when the address on the account was last proven to
-- reach its owner: '' means not yet. It is cleared whenever the email changes, because what was
-- proven was the old address.
--
-- Every account that already has an email is marked verified as of its creation. Those people
-- have been signing in and receiving mail for weeks under no such rule, and nagging them now to
-- prove an address the product has been writing to all along would be a rule applied backwards.
ALTER TABLE account ADD COLUMN email_verified TEXT NOT NULL DEFAULT '';
UPDATE account SET email_verified = created WHERE email <> '';

-- One row per link sent, shaped like `reset`: only the code's sha256 is kept. `email` is the
-- address the link was sent to, so a link sent before an email change cannot verify the new one.
CREATE TABLE email_verify (
  hash       TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  created    TEXT NOT NULL,
  expires    TEXT NOT NULL,
  used       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX email_verify_account ON email_verify(account_id);
