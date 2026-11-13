-- Who a send from the owner's admin hub is still to reach (src/announcements.ts, campaigns).
--
-- /admin sends in batches its page asks for, to whoever is reachable at that moment. The hub only
-- asks once and then leaves, so its send is fixed when it is asked for: every reachable account is
-- queued here, the once-a-minute cron mails a batch and removes their rows, and an account that
-- signs up afterwards is never sent old news. A row goes when it is sent, and also when its account
-- stops being reachable (said no, suspended, deleted) before its turn came.
CREATE TABLE announcement_queue (
  announcement_id TEXT NOT NULL REFERENCES announcement(id) ON DELETE CASCADE,
  account_id      TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, account_id)
);
