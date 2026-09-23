-- Who runs the product, as a fact about an account rather than a list in the deployment.
--
-- Giving a plan away (0026) was gated by `ADMIN_ACCOUNTS`, a secret holding account ids. That is
-- the right shape for bootstrapping and the wrong one for working: adding or removing an operator
-- meant editing a secret and redeploying, the list said nothing about who those ids belong to, and
-- nothing recorded when somebody was given the power or when it was taken away.
--
-- ONE COLUMN, AND ALMOST EVERY ROW IS EMPTY. `role` is '' for everybody who uses Passalong and
-- 'super' for the few who run it. Not a table of roles and permissions: there is exactly one
-- power here — the operator routes — and a permission system to express one bit would be a system
-- to maintain rather than a thing to read.
--
-- `ADMIN_ACCOUNTS` stays, and narrows to what it is actually good at: bootstrapping the first
-- super on a fresh deployment, and getting back in when the last one is locked out. It is checked
-- alongside this column, never instead of it.
ALTER TABLE account ADD COLUMN role TEXT NOT NULL DEFAULT '';

-- The two facts a revoked or granted role raises afterwards: when, and by whom. Kept on the
-- account rather than in a log, because there is one of each and they are read together with it.
ALTER TABLE account ADD COLUMN role_since TEXT NOT NULL DEFAULT '';
ALTER TABLE account ADD COLUMN role_by TEXT NOT NULL DEFAULT '';

-- Every read of this is "is this one account a super", by id, which the primary key already
-- answers. The one listing — who are the supers — is rare and small enough to scan.
