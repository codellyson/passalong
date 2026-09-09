-- M10: a team can have more than one channel.
--
-- The column this replaces held one URL, which was the right size for proving the idea and the
-- wrong one the moment a team has a space for QA and a space for the people who fix things. A
-- table also gives each channel a name — "which of these is the one that stopped working" is
-- unanswerable when they are all the same anonymous string.
--
-- `failures` and `last_error` are here because a webhook that has been revoked on the other end
-- fails silently forever: the post is fire-and-forget by design, so without somewhere to record
-- the refusal nobody learns the channel is dead until they notice the quiet.
CREATE TABLE team_channel (
  id         TEXT PRIMARY KEY,
  team_id    TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  url        TEXT NOT NULL,
  created    TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  failures   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX team_channel_team ON team_channel(team_id);

-- Carry over whatever is already connected. A team with a working channel must not lose it to a
-- schema change, and nobody should have to go and paste a URL again to stand still.
INSERT INTO team_channel (id, team_id, name, url, created)
SELECT lower(hex(randomblob(8))), id, 'channel', webhook_url,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM team
WHERE webhook_url <> '';

-- Emptied rather than dropped. The column is a credential for somebody's room, so leaving it
-- populated once nothing reads it is leaving a secret lying about; dropping it outright is a
-- rewrite of the table for no gain.
UPDATE team SET webhook_url = '';
