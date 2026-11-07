-- The runner (`passalong work --watch`) is removed (2026-11-07). It took work a person ticked Safe
-- to run alone and ran an agent on it with nobody watching; since 2026-11-06 what that agent handed
-- in waited in review for a person to approve or send back. Work is now taken only by an agent in a
-- session somebody opened, and a hand-in is final again.
--
-- The runner and work_step tables and the alone columns stay, unread, so that taking the code back
-- out is a revert rather than a restore. What is cleared here is what would otherwise be stuck.

-- A runner hand-in left waiting for a review that no longer exists is finished the way complete()
-- in claims.ts finishes one: what it showed becomes its proof, the claim goes, the work is Done.
-- (0068_work.sql did the same when the first review stage went.)
INSERT INTO proof (work_id, account_id, ok, note, detail, checks, writeup, at)
  SELECT work_id, account_id, 1, note, evidence, checks, writeup, updated FROM claim
   WHERE state = 'review'
  ON CONFLICT(work_id, account_id) DO UPDATE SET ok = excluded.ok, note = excluded.note,
    detail = excluded.detail, checks = excluded.checks,
    writeup = CASE WHEN excluded.writeup <> '' THEN excluded.writeup ELSE proof.writeup END,
    at = excluded.at;
UPDATE work SET status = 'done', outcome = 'finished',
  markdown = replace(markdown, char(10) || 'status: ready' || char(10), char(10) || 'status: done' || char(10))
WHERE status <> 'done' AND id IN (SELECT work_id FROM claim WHERE state = 'review');
DELETE FROM claim WHERE state = 'review';

-- Nothing is marked to run alone any more, and no project starts its new work that way.
UPDATE work SET alone = 0, alone_by = '' WHERE alone <> 0;
UPDATE project SET alone_default = 0 WHERE alone_default <> 0;

-- The two notification kinds only the runner sent. Nothing renders them now.
DELETE FROM notification WHERE kind IN ('for_review', 'runner_passed');
DELETE FROM notice_outbox
 WHERE body LIKE '%"kind":"for_review"%' OR body LIKE '%"kind":"runner_passed"%';
