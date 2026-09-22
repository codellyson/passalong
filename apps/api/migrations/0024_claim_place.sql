-- A claim for every kind of guide, not only tasks. See docs/V2.md §11.
--
-- The lock was the guide: one row per guide, so one taker. That is right for a task and a bug, which
-- are for one repo, and wrong for a transfer handed to a team, which is meant to be repeated in each
-- teammate's repo. So the lock is now the guide in a place: `place` is '' for a task (one taker,
-- wherever the agent is) and the taker's repo, normalised by repoKey(), for anything else. Two
-- agents in one repo still collide on the primary key; two repos do not.
--
-- SQLite cannot change a primary key in place, so the table is rebuilt. Every existing claim is a
-- task's, so every existing row gets place ''. Nothing references `claim`.
CREATE TABLE claim_next (
  guide_id    TEXT NOT NULL REFERENCES guide(id) ON DELETE CASCADE,
  place       TEXT NOT NULL DEFAULT '',
  account_id  TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  agent_id    TEXT NOT NULL,
  host        TEXT NOT NULL DEFAULT '',
  repo        TEXT NOT NULL DEFAULT '',
  worktree    TEXT NOT NULL DEFAULT '',
  state       TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  report_id   TEXT NOT NULL DEFAULT '',
  pr          TEXT NOT NULL DEFAULT '',
  claimed_at  TEXT NOT NULL,
  lease_until TEXT NOT NULL,
  updated     TEXT NOT NULL,
  PRIMARY KEY (guide_id, place)
);
INSERT INTO claim_next (guide_id, place, account_id, agent_id, host, repo, worktree, state, note,
                        report_id, pr, claimed_at, lease_until, updated)
  SELECT guide_id, '', account_id, agent_id, host, repo, worktree, state, note,
         report_id, pr, claimed_at, lease_until, updated
    FROM claim;
DROP TABLE claim;
ALTER TABLE claim_next RENAME TO claim;
CREATE INDEX claim_agent ON claim(agent_id, state);
