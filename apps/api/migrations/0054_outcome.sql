-- How a guide reached Done. `consumed` covers work a person approved after review and work that
-- was archived (shelved by its author or an admin), and the board's Done column could not tell
-- them apart. 'approved' or 'archived' while consumed; '' otherwise. Written by every route that
-- moves a guide into Done and cleared when it leaves.
ALTER TABLE guide ADD COLUMN outcome TEXT NOT NULL DEFAULT '';

-- What is already done: approved when a person approved it (the approved event) or a reader showed
-- it working (a passing verdict); archived otherwise, which is the honest default for the rest.
UPDATE guide SET outcome = CASE
    WHEN EXISTS (SELECT 1 FROM task_event e WHERE e.guide_id = guide.id AND e.kind = 'approved')
      OR EXISTS (SELECT 1 FROM verdict v WHERE v.guide_id = guide.id AND v.ok = 1)
    THEN 'approved' ELSE 'archived' END
 WHERE status = 'consumed';
