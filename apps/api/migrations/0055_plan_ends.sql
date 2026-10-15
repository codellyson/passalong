-- When a paid plan that was cancelled stops. Bachs cancels at the end of the period already paid
-- for, so a cancelled plan is still paid until then and the hub has to say so, or it looks like it
-- will renew. ISO time from the webhook, '' when nothing is ending; cleared when it is resumed.
-- Not `plan_until`: that is a gift's end, which the hourly sweep enforces and the hub words as given.
ALTER TABLE account ADD COLUMN plan_ends TEXT NOT NULL DEFAULT '';
ALTER TABLE team ADD COLUMN plan_ends TEXT NOT NULL DEFAULT '';
