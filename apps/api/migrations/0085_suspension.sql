-- An account suspended from the owner's admin hub (src/admin-users.ts, admin-hub/CONTRACT.md).
--
-- `suspended_at` is when, '' while the account is in good standing; `suspended_by` is the hub
-- operator's email, because the operator is a person at the hub and may have no account here;
-- `suspended_reason` is what they wrote. A suspended account is refused at every way in (the auth
-- middleware, sign-in, password reset) and is sent no product news. Unsuspending clears all three:
-- the credentials revoked when it was suspended stay revoked.
ALTER TABLE account ADD COLUMN suspended_at TEXT NOT NULL DEFAULT '';
ALTER TABLE account ADD COLUMN suspended_by TEXT NOT NULL DEFAULT '';
ALTER TABLE account ADD COLUMN suspended_reason TEXT NOT NULL DEFAULT '';
