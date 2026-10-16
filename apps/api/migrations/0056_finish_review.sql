-- Nothing waits for review any more (docs/REVIEW.md): finishing is final. Hand-ins already waiting
-- in review become finished, as they would have been under the new rule — 64% of them were never
-- going to be answered.
--
-- What each one showed is kept as a standing verdict first, so it is still on the guide after its
-- claim goes. A guide that nobody else still holds goes to Done, `outcome = finished`, with the
-- status in its frontmatter said too, as the server keeps it everywhere else. Then the waiting
-- claims go; a guide someone still holds in another repo stays in progress.
INSERT INTO verdict (guide_id, account_id, ok, note, detail, checks, writeup, at)
  SELECT guide_id, account_id, 1, note, evidence, checks, writeup, updated FROM claim
   WHERE state = 'review'
ON CONFLICT(guide_id, account_id) DO NOTHING;

UPDATE guide SET status = 'consumed', outcome = 'finished',
  markdown = replace(markdown, char(10) || 'status: published' || char(10), char(10) || 'status: consumed' || char(10))
 WHERE status <> 'consumed'
   AND id IN (SELECT guide_id FROM claim WHERE state = 'review')
   AND id NOT IN (SELECT guide_id FROM claim WHERE state <> 'review');

DELETE FROM claim WHERE state = 'review';
