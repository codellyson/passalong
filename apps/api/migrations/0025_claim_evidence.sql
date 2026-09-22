-- What the agent ran, and what came back. See docs/V2.md §11.
--
-- A hand-in said "done" and, on a task, pointed at a write-up the agent wrote about its own work.
-- Both are the agent's word. The person at the gate had nothing from the run itself: no command, no
-- test summary, no link to the change. So `evidence` is the transcript side of a hand-in — what was
-- run and what came back — kept on the claim beside the write-up, and required of every agent that
-- hands work in.
--
-- Bigger than `note` on purpose: a note is one line for the board, this is a paste of output.
ALTER TABLE claim ADD COLUMN evidence TEXT NOT NULL DEFAULT '';
