-- Product news by email: what changed in Passalong, written by whoever runs it (/admin) and sent to
-- every account with a proven address that has not said no. See src/announcements.ts.
--
-- `news_mail_off` is when the account said no, from a mail's link or from Settings; '' means they
-- still get it. On by default, because these people signed up to the product the news is about, and
-- every mail carries the way to stop.
ALTER TABLE account ADD COLUMN news_mail_off TEXT NOT NULL DEFAULT '';

-- One mail, written once and sent to everybody. Editable and deletable until the first real send
-- (`started`); after that it is the record of what people were told.
CREATE TABLE announcement (
  id         TEXT PRIMARY KEY,
  subject    TEXT NOT NULL,
  -- A little markdown: paragraphs, "## " headings, "- " lists, `code`, **bold**, [links](https://…).
  body       TEXT NOT NULL,
  created    TEXT NOT NULL,
  created_by TEXT NOT NULL,
  started    TEXT NOT NULL DEFAULT '',
  started_by TEXT NOT NULL DEFAULT ''
);

-- Who it went to. The row is written before the mail is sent, so two sends running at once (a double
-- click, a second tab) cannot both reach the same person; `ok` is whether the mailer took it.
CREATE TABLE announcement_sent (
  announcement_id TEXT NOT NULL REFERENCES announcement(id) ON DELETE CASCADE,
  account_id      TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  sent            TEXT NOT NULL,
  ok              INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (announcement_id, account_id)
);

-- The links that stop product news, one per mail sent, kept as the token's sha256 like every other
-- link in a mail. They never expire: a person who finds an old mail must still be able to say no.
CREATE TABLE news_off_link (
  hash       TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  created    TEXT NOT NULL
);
CREATE INDEX news_off_link_account ON news_off_link(account_id);
