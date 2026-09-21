-- Tasks an agent can take, and the claim that says which agent has one. See docs/V2.md.
--
-- `guide.target` is the repo a task is for, denormalised from `target_context:` in its frontmatter
-- the same way `kind` is (migration 0007), because `next` filters on it and cannot open every
-- document to find out. Normalised by `repoKey()` in claims.ts: `owner/repo` when the value was a
-- remote URL, otherwise the name as written, lowercase. Empty for every guide that is not a task,
-- and for a task that is not for any repo.
ALTER TABLE guide ADD COLUMN target TEXT NOT NULL DEFAULT '';
CREATE INDEX guide_task_queue ON guide(kind, status, target, created);

-- One row per task somebody has taken. The primary key is the lock: two agents asking for work at
-- the same moment both try to insert the same guide_id, and exactly one insert changes a row. No
-- read-then-write, so nothing can slip between the two.
--
-- Deliberately not a guide status, for the reasons migration 0013 gives for acks: it is a fact
-- about the work rather than about the document, and the document is the author's.
--
-- There is no `stalled` value. Stalled is `claimed` with `lease_until` in the past, derived on
-- read, so nothing has to run on a clock to move a card — and a lapsed claim stays exactly as
-- locked as a live one. It never goes back to the queue on its own: only a person releasing it,
-- or the same agent coming back to it, moves it again.
CREATE TABLE claim (
  guide_id    TEXT PRIMARY KEY REFERENCES guide(id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  -- Minted once per worktree and kept in its `.passalong/agent.json`, so a restarted session in
  -- the same worktree is the same agent and takes its card back.
  agent_id    TEXT NOT NULL,
  host        TEXT NOT NULL DEFAULT '',
  repo        TEXT NOT NULL DEFAULT '',
  worktree    TEXT NOT NULL DEFAULT '',
  state       TEXT NOT NULL,                -- claimed | review
  note        TEXT NOT NULL DEFAULT '',     -- the latest one-line progress, capped by the API
  report_id   TEXT NOT NULL DEFAULT '',     -- the transfer guide written on finish
  pr          TEXT NOT NULL DEFAULT '',     -- PR or branch link, when there is one
  claimed_at  TEXT NOT NULL,
  lease_until TEXT NOT NULL,
  updated     TEXT NOT NULL
);
CREATE INDEX claim_agent ON claim(agent_id, state);
