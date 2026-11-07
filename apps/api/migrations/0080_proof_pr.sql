-- The link to the change a hand-in brought (2026-11-07). The claim kept it as `pr`, and complete()
-- deleted the claim without copying it, so a finished work never showed where its change was: a
-- person had to go and find it in the repo to review it.
ALTER TABLE proof ADD COLUMN pr TEXT NOT NULL DEFAULT '';
