-- Files that are not pictures. See docs/CONVERSATION.md §6, phase B.
--
-- A screenshot is a picture drawn where it is mentioned, and `shot` (migration 0006) is built on
-- that: its name, its allow-list and every place that reads it assume an image. A PDF, a CSV or a
-- zip is none of those things — it is downloaded, never drawn — so it gets its own table rather than
-- a widened `shot`, which would have made "a shot is an image" untrue in the places that rely on it.
--
-- Owned the way a shot is: uploaded before anything refers to it, claimed by the document that names
-- its URL (`guide_id` is written by the server from the text, never by the client), and released and
-- swept when nothing does. The `account_id` in the claim's WHERE is what stops somebody claiming a
-- file by naming its id.
--
-- Unlike a shot it is private. A picture is evidence in a document that travels by link, so its id is
-- the secret; a CSV somebody attached to a task is not for whoever holds the link. Reading one needs
-- a credential and the right to read the guide it is claimed by.
CREATE TABLE attachment (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  guide_id   TEXT NOT NULL DEFAULT '',
  name       TEXT NOT NULL DEFAULT '',
  type       TEXT NOT NULL,
  bytes      INTEGER NOT NULL DEFAULT 0,
  created    TEXT NOT NULL
);
CREATE INDEX attachment_account_created ON attachment(account_id, created DESC);
CREATE INDEX attachment_guide ON attachment(guide_id);
