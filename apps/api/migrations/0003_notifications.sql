-- Notifications. Every moment that closes a transfer loop gets a durable row here, addressed to
-- the account that should hear about it. Email is one delivery channel over these rows, not the
-- system itself: with no sender domain onboarded the feed still works, and turning mail on later
-- only adds a channel.

CREATE TABLE notification (
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE, -- who is being told
  kind       TEXT NOT NULL,   -- handoff | shared | pulled | consumed | joined
  guide_id   TEXT NOT NULL DEFAULT '',
  actor_id   TEXT NOT NULL DEFAULT '',  -- who did it; '' is an anonymous share-link reader
  team_id    TEXT NOT NULL DEFAULT '',
  at         TEXT NOT NULL,             -- when it last happened
  times      INTEGER NOT NULL DEFAULT 1,
  read_at    TEXT NOT NULL DEFAULT '',
  emailed_at TEXT NOT NULL DEFAULT '',
  id         INTEGER PRIMARY KEY AUTOINCREMENT
);

-- One row per (recipient, kind, guide, actor): the same person pulling the same guide twice is
-- the same fact, so it bumps `at` and `times` instead of piling up a second line.
CREATE UNIQUE INDEX notification_event ON notification(account_id, kind, guide_id, actor_id);
CREATE INDEX notification_account_at ON notification(account_id, at DESC);
CREATE INDEX notification_unread ON notification(account_id, read_at);
