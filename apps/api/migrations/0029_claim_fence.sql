-- A generation number on the claim, so a stale agent cannot hand in over the card it used to hold.
--
-- The claim is already a lock: `progress`, `hand_in` and `pass` are conditional writes guarded by
-- `agent_id` and `state`, and `release` deletes the row, so an agent that went quiet and came back
-- is told it no longer holds the task. What that guard cannot see is ABA. `agent_id` is minted per
-- worktree and deliberately stable — a restarted session in the same worktree is the same agent
-- and takes its card back — so: an agent takes a task, a person releases it, the same agent takes
-- it again, and a hand-in still in flight from the first claim matches the guard on the second.
-- The request carries nothing that says which of the two it belongs to.
--
-- This is the number that says. Every fresh claim gets the next one for that guide and place, the
-- agent is told what it is when it takes the work, and it sends it back with everything it does;
-- a write whose number is not the current one is refused. It is Chubby's lock generation number
-- ("a sequencer... contains the name of the lock, the mode in which it was acquired, and the lock
-- generation number") and KCL's `leaseCounter`, "used for lease versioning so that workers can
-- detect that their lease has been taken by another worker".
--
-- It lives in its own table and not on the claim because the claim is deleted on release, on pass,
-- and on approve — and a counter that goes back to zero with it is not a counter. `claim_fence`
-- outlives every claim on that guide in that place, and only ever counts up. Gaps are fine: a take
-- that loses the race burns a number, which costs nothing.
--
-- Rollout: existing claims are stamped 1 and their counter set to 1, so the next take gives 2 and
-- no live claim is invalidated by the migration. `fence = 0` means a claim from before this
-- existed, and a write that sends no number is still accepted — an agent on an older CLI has none
-- to send. Requiring it is the follow-up, once published clients carry it.
CREATE TABLE claim_fence (
  guide_id TEXT NOT NULL REFERENCES guide(id) ON DELETE CASCADE,
  place    TEXT NOT NULL DEFAULT '',
  -- The last number handed out. The next claim gets held + 1.
  held     INTEGER NOT NULL,
  PRIMARY KEY (guide_id, place)
);

ALTER TABLE claim ADD COLUMN fence INTEGER NOT NULL DEFAULT 0;

INSERT INTO claim_fence (guide_id, place, held) SELECT guide_id, place, 1 FROM claim;
UPDATE claim SET fence = 1;
