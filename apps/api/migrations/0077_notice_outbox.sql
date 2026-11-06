-- Notices waiting to go out together (2026-11-06). Every event used to send its own phone push and
-- its own team channel post the moment it happened, so twelve pieces of work shared at once were
-- twelve cards in Google Chat and twelve buzzes. Now the push or post is written here, and a
-- once-a-minute tick sends each person's pushes, and each team's posts, as one message once a
-- burst has gone quiet (notify.ts flushNotices). The feed and email are unchanged.
CREATE TABLE notice_outbox (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 'push': to a person's devices, `dest` is the account. 'team': to a team's channels, `dest` is
  -- the team.
  channel TEXT NOT NULL,
  dest    TEXT NOT NULL,
  at      TEXT NOT NULL,
  -- The message as it would have been sent alone: a PushMessage or an Announcement, as JSON.
  body    TEXT NOT NULL
);
CREATE INDEX notice_outbox_dest ON notice_outbox(channel, dest, id);
