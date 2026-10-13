-- Alerts by email (src/inbound.ts): an address an account pastes into whatever sends its alerts,
-- so each alert arrives as a draft task.
--
-- `key` is the local part of the address. Kept as written, not hashed, because the hub shows it
-- every time Settings opens. It decides whose inbox a message lands in; whether anything is
-- created is decided by `inbound_sender`, so knowing the address alone gets a stranger only a
-- pending row the owner can block.
--
-- `target` is the repo the alerts' tasks are for (`owner/repo`, see repoKey in claims.ts). An
-- agent's `take` with no id only hands out tasks for the repo it is in, so without one an alert
-- task waits for someone to take it by hand.
CREATE TABLE inbound (
  account_id TEXT PRIMARY KEY REFERENCES account(id) ON DELETE CASCADE,
  key        TEXT NOT NULL UNIQUE,
  target     TEXT NOT NULL DEFAULT '',
  created    TEXT NOT NULL
);

-- Who may send to it. A sender's first message only asks; the owner allows or blocks it once.
-- `subject` is the first one seen, so a person can recognise what is asking — and for Gmail's
-- forwarding check it carries the confirmation code.
CREATE TABLE inbound_sender (
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  sender     TEXT NOT NULL,
  state      TEXT NOT NULL DEFAULT 'pending',
  subject    TEXT NOT NULL DEFAULT '',
  first_at   TEXT NOT NULL,
  last_at    TEXT NOT NULL,
  times      INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (account_id, sender)
);

-- One open task per alert, however often it fires. `fingerprint` is the sender and the subject
-- with its numbers taken out; a repeat bumps `times` here instead of making a second task.
CREATE TABLE inbound_alert (
  account_id  TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  guide_id    TEXT NOT NULL REFERENCES guide(id) ON DELETE CASCADE,
  times       INTEGER NOT NULL DEFAULT 1,
  last_at     TEXT NOT NULL,
  noted_at    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (account_id, fingerprint)
);
