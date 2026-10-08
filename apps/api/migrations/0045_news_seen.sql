-- The newest entry of news.ts an account has been told about. An agent is told what changed once,
-- on the first `take` after it, and the id here is what keeps it from being told again.
ALTER TABLE account ADD COLUMN news_seen TEXT NOT NULL DEFAULT '';
