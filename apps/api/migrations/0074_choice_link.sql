-- A question's options, picked from the email that asks it: one link per question and person, its
-- hash kept here (the link itself only in the mail). It works for that question only, once, while
-- the question is still waiting, and for two weeks at most. The pick is a reply like any other.
CREATE TABLE choice_link (
  hash TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
  -- The asked event the options belong to (task_event.id).
  event_id INTEGER NOT NULL,
  -- Who the mail went to, and so who the pick is from.
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  created TEXT NOT NULL,
  expires TEXT NOT NULL,
  -- When it was used, and the option picked (1-based); '' and 0 until then.
  used TEXT NOT NULL DEFAULT '',
  picked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX choice_link_work ON choice_link(work_id);
