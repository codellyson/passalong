-- How many pieces of work an account has ever made outside a paying team (quota.ts roomOf).
-- The free plan is one piece of work to try Passalong (2026-11-20), and counting the work kept let
-- anyone make one, delete it and make another for ever. Deleted work leaves no row, so the count
-- has to be kept as it happens: +1 in PUT /v1/work/:id when new work is not covered. Starts at what
-- each account keeps outside a paying team now, the best answer the data still holds.
ALTER TABLE account ADD COLUMN work_made INTEGER NOT NULL DEFAULT 0;
UPDATE account SET work_made = (
  SELECT COUNT(*) FROM work w WHERE w.account_id = account.id
    AND NOT EXISTS (SELECT 1 FROM team t WHERE t.id = w.team_id AND t.plan = 'team')
);
