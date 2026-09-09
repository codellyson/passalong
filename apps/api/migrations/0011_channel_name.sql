-- The carried-over channels were named "channel", which is what a placeholder looks like on a
-- settings screen: a row reading `channel  chat.googleapis.com` says nothing and reads as
-- unfinished. Emptied, so the interface falls back to showing the host — a real fact — until
-- someone names the room themselves.
UPDATE team_channel SET name = '' WHERE name = 'channel';
