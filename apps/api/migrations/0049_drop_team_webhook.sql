-- team.webhook_url was retired by 0010, which copied every value into team_channel and emptied the
-- column. Nothing has read it since. Unlike account.token_hash it is neither UNIQUE nor referenced,
-- so SQLite drops it in place without the table rebuild that would cascade through every child.
ALTER TABLE team DROP COLUMN webhook_url;
