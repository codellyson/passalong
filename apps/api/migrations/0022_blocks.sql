-- Which task waits on which, from `blocked_by:` in a task's frontmatter. See docs/V2.md.
--
-- A table rather than a column, because the queue has to skip every task with an unfinished
-- blocker in the same query that finds the next one, and a list inside a text column cannot be
-- joined. Rewritten whole on every publish of the waiting task, like the frontmatter it comes from.
--
-- A blocker is finished when a person approved it (its status is `consumed`), not when an agent
-- said so: unverified work cascading into the tasks built on it is what the gate is for. Deleting
-- a blocker deletes the row, and the task it held stops waiting.
CREATE TABLE task_block (
  guide_id   TEXT NOT NULL REFERENCES guide(id) ON DELETE CASCADE,  -- the task that waits
  blocker_id TEXT NOT NULL REFERENCES guide(id) ON DELETE CASCADE,  -- the task it waits for
  PRIMARY KEY (guide_id, blocker_id)
);
CREATE INDEX task_block_blocker ON task_block(blocker_id);
