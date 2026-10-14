-- A task's hand-in write-up is a transfer guide the agent publishes just before handing in. It is
-- the record of finished work, read from the task's review, not work for anyone to take — so it
-- never belongs on the board. When a hand-in names it, it is stored as archived (consumed) and
-- this column names the task it reports on, which is what keeps it out of the board's columns.
-- '' for every other guide.
ALTER TABLE guide ADD COLUMN report_of TEXT NOT NULL DEFAULT '';

-- Write-ups already named by a hand-in still waiting on review. Approved ones lost their claim row,
-- and with it the link; they stay where they are.
UPDATE guide SET report_of = (SELECT c.guide_id FROM claim c WHERE c.report_id = guide.id LIMIT 1)
 WHERE id IN (SELECT report_id FROM claim WHERE report_id <> '');
