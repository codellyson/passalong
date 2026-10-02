-- The last reply an agent has been given. See docs/CONVERSATION.md.
--
-- A person's reply is a `task_event` of kind `replied` (migration 0037) and nothing wakes the agent it
-- is for: there is no channel into a worktree. The agent hears on its next `progress` or `take`,
-- which ask for every reply with an id above this and move it up in the same request.
--
-- It is on the claim and not the guide because a handoff can be held in several repos at once, and
-- each holder has been told something different. It starts at 0, so a claim taken before this
-- migration is told of replies written after it and nothing before, of which there are none.
ALTER TABLE claim ADD COLUMN replied_through INTEGER NOT NULL DEFAULT 0;
