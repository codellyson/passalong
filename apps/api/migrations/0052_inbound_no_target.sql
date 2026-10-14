-- One repo per account did not fit: an account's tasks from email and webhooks are for many
-- repos. The repo is now chosen when a task is marked Ready (PATCH /v1/guides/:id/status with
-- `target`), or carried on a webhook URL as `?repo=owner/repo`. Nothing reads this column.
ALTER TABLE inbound DROP COLUMN target;
