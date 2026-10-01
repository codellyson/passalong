-- What happened to a guide while somebody held it, in the order it happened.
--
-- The claim is the *present*: one row, overwritten by every progress call and deleted by a release,
-- a pass, an approval or a send-back. `claim.note` is only the latest line, and once the row is gone
-- nothing says an agent ever had the work. That is enough for a board, which asks what is true now,
-- and not enough for a thread, which asks what was said — so this is the one place the history lives.
--
-- Append-only: nothing updates or deletes a row except the guide being deleted. Not a second source
-- of truth for state — the claim and the guide still say who holds what and whether it is done.
-- Written beside each of those transitions by `event()` in claims.ts, after the transition has
-- succeeded and never instead of it, so a missing row costs a bubble and never a lock.
--
-- `kind` is what happened: taken | progress | handed_in | passed | released | approved | sent_back.
-- `agent_id` is empty for the author's own acts (released, approved, sent_back), which are a person
-- speaking rather than a worktree. `host` is kept so a bubble can say where the agent was.
-- `body` is one line, capped by the writer: a status, never a log.
CREATE TABLE task_event (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guide_id   TEXT NOT NULL REFERENCES guide(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  agent_id   TEXT NOT NULL DEFAULT '',
  host       TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  at         TEXT NOT NULL
);
CREATE INDEX task_event_guide ON task_event(guide_id, id);
