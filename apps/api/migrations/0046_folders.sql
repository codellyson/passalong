-- A folder is a small project context shared by a person and their agents. Its documents and
-- assets outlive any one guide; guides are linked, not rewritten or made to own the files.
CREATE TABLE folder (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES account(id),
  team_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE INDEX folder_owner_updated ON folder(created_by, updated DESC);
CREATE INDEX folder_team_updated ON folder(team_id, updated DESC);

CREATE TABLE folder_document (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL REFERENCES folder(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL REFERENCES account(id),
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  UNIQUE(folder_id, name)
);
CREATE INDEX folder_document_folder ON folder_document(folder_id, updated DESC);

CREATE TABLE folder_document_revision (
  document_id TEXT NOT NULL REFERENCES folder_document(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  saved_by TEXT NOT NULL REFERENCES account(id),
  saved_at TEXT NOT NULL,
  PRIMARY KEY(document_id, version)
);

CREATE TABLE folder_asset (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL REFERENCES folder(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES account(id),
  created TEXT NOT NULL
);
CREATE INDEX folder_asset_folder ON folder_asset(folder_id, created DESC);

CREATE TABLE folder_guide (
  folder_id TEXT NOT NULL REFERENCES folder(id) ON DELETE CASCADE,
  guide_id TEXT NOT NULL REFERENCES guide(id) ON DELETE CASCADE,
  added_by TEXT NOT NULL REFERENCES account(id),
  added TEXT NOT NULL,
  PRIMARY KEY(folder_id, guide_id)
);
CREATE INDEX folder_guide_guide ON folder_guide(guide_id);
