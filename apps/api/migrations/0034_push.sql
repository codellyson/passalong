-- A device that asked to be told when something needs this account, and the keys to tell it with.
--
-- One row per browser subscription (Web Push, RFC 8030). The endpoint is the push service's
-- address for that one browser and is unique across every account: a browser handed from one
-- person to another re-subscribes, and the row moves with it rather than notifying both. `p256dh`
-- and `auth` are the browser's keys, which is what lets the push service carry a message it cannot
-- read (RFC 8291). `private` is per device, because a lock screen is: on, the notice says only that
-- something needs you, never a guide's title. A push service answering 404 or 410 deletes the row.
CREATE TABLE push_subscription (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  private    INTEGER NOT NULL DEFAULT 0,
  created    TEXT NOT NULL,
  last_ok    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX push_subscription_account ON push_subscription(account_id);
