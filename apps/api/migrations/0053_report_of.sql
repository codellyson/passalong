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

-- Approved ones lost the link, but not the timing: the CLI publishes the write-up, under its task
-- (`parent`), seconds before it hands in. A transfer under a task, by the account whose hand-in
-- event came within five minutes after it, is that write-up. Tasks worked before 0037 have no
-- events and stay where they are.
UPDATE guide SET report_of = guide.parent_id
 WHERE report_of = '' AND kind = 'transfer'
   AND parent_id IN (SELECT id FROM guide WHERE kind = 'task')
   AND EXISTS (
     SELECT 1 FROM task_event e
      WHERE e.guide_id = guide.parent_id AND e.kind = 'handed_in' AND e.account_id = guide.account_id
        AND julianday(e.at) >= julianday(guide.created)
        AND julianday(e.at) <= julianday(guide.created) + 5.0 / 1440
   );
