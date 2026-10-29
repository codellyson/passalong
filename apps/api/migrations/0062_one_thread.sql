-- The thread is task_event alone (docs/WORK.md).
--
-- thread() in claims.ts used to merge three tables: task_event, verdict (a reviewer's "it works" /
-- "it does not") and ack (a reader's "on it" / "not me"), and rendered three kinds nobody writes
-- any more (approved, closed, and reopen stored as sent_back). Each of those is moved into
-- task_event as the line it reads as now, so the thread reads one table and the hub renders the
-- kinds that are still written. verdict and ack stay: a hand-in's standing verdict is what the
-- work page leads with, and a decline is what keeps work off the decliner's list.

UPDATE task_event SET kind = 'reopened' WHERE kind = 'sent_back';

-- A person said it was done (an approval, or marked done while an agent held it), or closed it.
UPDATE task_event
   SET kind = 'handed_in', body = 'Marked done' || CASE WHEN body <> '' THEN ': ' || body ELSE '' END
 WHERE kind = 'approved';
UPDATE task_event
   SET kind = 'handed_in', body = 'Closed' || CASE WHEN body <> '' THEN ': ' || body ELSE '' END
 WHERE kind = 'closed';

-- An ack is a take or a pass, unless the thread already has that person saying so.
INSERT INTO task_event (guide_id, kind, account_id, body, at)
SELECT k.guide_id, CASE WHEN k.taken = 1 THEN 'taken' ELSE 'passed' END, k.account_id, k.note, k.at
  FROM ack k
 WHERE NOT EXISTS (
   SELECT 1 FROM task_event e
    WHERE e.guide_id = k.guide_id AND e.account_id = k.account_id
      AND e.kind = CASE WHEN k.taken = 1 THEN 'taken' ELSE 'passed' END);

-- A passing verdict is a hand-in, unless one is already there; a failing one is a reopen, with why.
INSERT INTO task_event (guide_id, kind, account_id, body, at)
SELECT v.guide_id, CASE WHEN v.ok = 1 THEN 'handed_in' ELSE 'reopened' END, v.account_id,
       CASE WHEN v.ok = 1 THEN COALESCE(NULLIF(v.writeup, ''), v.note) ELSE v.note END, v.at
  FROM verdict v
 WHERE v.ok = 0
    OR NOT EXISTS (
      SELECT 1 FROM task_event e
       WHERE e.guide_id = v.guide_id AND e.account_id = v.account_id AND e.kind = 'handed_in');
