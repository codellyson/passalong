-- What saved each version of a document, as `guide.client` says what wrote a guide (0035): `hub` is
-- a person's hand, `mcp` and `cli@…` an agent's. `api` is a bare token (a script, or a person signed
-- in by a token link) and '' is every version from before this column: both unknown, never guessed.
-- A project's History says which.
ALTER TABLE folder_document_revision ADD COLUMN client TEXT NOT NULL DEFAULT '';
