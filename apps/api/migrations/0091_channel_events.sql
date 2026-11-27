-- A channel can be an app as well as a room.
--
-- A room (Slack, Discord, Google Chat) gets a sentence for the few events people want to read. An
-- app (a ticketing system, a dashboard, anything that drives its own screen from Passalong) gets
-- every move on a team's work as signed JSON: taken, progress, asked, handed in, done. Same table,
-- because it is the same thing to an owner: a URL Passalong posts to, which can be tested, can
-- fail, and is never shown again once saved.
--
-- `secret` signs an app's posts (HMAC-SHA256) so the receiver can tell them from anyone else who
-- learns its URL. Kept as written, not hashed: the server needs it to sign. Empty for a room.
ALTER TABLE team_channel ADD COLUMN kind TEXT NOT NULL DEFAULT 'room';
ALTER TABLE team_channel ADD COLUMN secret TEXT NOT NULL DEFAULT '';
