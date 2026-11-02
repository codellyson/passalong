-- When each account last opened each document, so a version someone else saved after it is marked
-- as changed in the hub, the way unread notifications mark work. Opening the document, or "Mark all
-- seen", writes the row. Every document that exists now counts as seen by everyone who can read it,
-- or the first look after this migration would mark every page ever written.
CREATE TABLE folder_document_seen (
  account_id  TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES folder_document(id) ON DELETE CASCADE,
  at          TEXT NOT NULL,
  PRIMARY KEY (account_id, document_id)
);
INSERT OR IGNORE INTO folder_document_seen (account_id, document_id, at)
SELECT m.account_id, d.id, d.updated FROM folder_document d
  JOIN folder f ON f.id = d.folder_id JOIN membership m ON m.team_id = f.team_id
 WHERE f.team_id <> '';
INSERT OR IGNORE INTO folder_document_seen (account_id, document_id, at)
SELECT f.created_by, d.id, d.updated FROM folder_document d JOIN folder f ON f.id = d.folder_id
 WHERE f.team_id = '';
