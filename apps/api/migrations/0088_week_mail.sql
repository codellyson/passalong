-- The Monday mail of what was finished last week (src/week.ts). `week_mail_off` is when the account
-- turned it off in Settings; '' means they still get it. On by default: it is about their own work.
ALTER TABLE account ADD COLUMN week_mail_off TEXT NOT NULL DEFAULT '';
