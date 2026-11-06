-- A runner (`passalong work --watch`) as it last said it was: on which machine, for which repo,
-- what it is working on, and how much of today's allowance it has used. It reports once a minute
-- and when it stops, so the hub can say what is running without anyone looking at a terminal.
CREATE TABLE runner (
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  host TEXT NOT NULL,
  repo TEXT NOT NULL,
  -- [{ "id": "...", "title": "..." }], what its agents are on now.
  running TEXT NOT NULL DEFAULT '[]',
  runs_today INTEGER NOT NULL DEFAULT 0,
  per_day INTEGER NOT NULL DEFAULT 0,
  at_once INTEGER NOT NULL DEFAULT 0,
  -- '' while it runs; when it said it stopped.
  stopped TEXT NOT NULL DEFAULT '',
  started TEXT NOT NULL,
  seen TEXT NOT NULL,
  PRIMARY KEY (account_id, host, repo)
);
