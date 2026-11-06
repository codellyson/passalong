-- The runner, made usable (2026-11-06). In real use it never took anything: it asked only for work
-- whose `target` was exactly its repo, and nearly all work has no target, or one written as prose
-- ("techchak-backend (legacy express)") that never equals a repo's name.

-- The repo a person chose for work they marked safe to run alone, as the runner names it
-- (owner/name). '' leaves it to the work's project's repo, then to a target that names a repo.
ALTER TABLE work ADD COLUMN alone_repo TEXT NOT NULL DEFAULT '';

-- A runner started in a folder of checkouts serves all of them: their names, as JSON. '[]' is a
-- runner for the one repo in `repo`, which is what every runner before this reported.
ALTER TABLE runner ADD COLUMN repos TEXT NOT NULL DEFAULT '[]';

-- What a runner's agent is doing, a line at a time ("Editing src/deals/form.tsx", "Running npm
-- test"), sent by the runner as it reads the agent's output, so a person can watch from the hub.
-- The newest 200 per piece of work are kept.
CREATE TABLE work_step (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id TEXT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
  at      TEXT NOT NULL,
  text    TEXT NOT NULL
);
CREATE INDEX work_step_work ON work_step(work_id, id);
