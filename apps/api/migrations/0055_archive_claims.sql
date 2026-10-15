-- Archiving a guide (the status route, `consumed`) left its claims behind: a hand-in waiting on a
-- guide already in Done, which nobody could answer and which sat in Needs you and the In review
-- lists. 61 hand-ins were stuck like that in production on 2026-10-15. The route now clears them
-- when it archives; this clears the ones already stuck. Approved and closed guides lost their
-- claims when they were answered, so anything still held on a consumed guide is one of these.
DELETE FROM claim WHERE guide_id IN (SELECT id FROM guide WHERE status = 'consumed');
