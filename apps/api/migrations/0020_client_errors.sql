-- M20: why a connector last failed to sign in, so Settings can say so.
--
-- A refused token exchange used to exist only as a log line. The person looking at Settings saw a
-- connector listed as approved while the app they connected said "failed", and nothing on either
-- side named the reason. `last_error` is the refusal reason the token endpoint gave
-- (`secret_missing`, `secret_mismatch`), written when it refuses a client it knows and cleared the
-- next time that client gets a token. An unknown client id has no row to write it on.
ALTER TABLE oauth_client ADD COLUMN last_error TEXT NOT NULL DEFAULT '';
ALTER TABLE oauth_client ADD COLUMN last_error_at TEXT NOT NULL DEFAULT '';
