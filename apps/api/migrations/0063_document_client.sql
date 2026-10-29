-- What saved each version of a document, as `guide.client` says what wrote a guide (0035): `hub` is
-- a person's hand, anything else (`mcp`, `cli@…`, `api`) an agent's. A project's History says which.
-- '' is every version from before it: unknown, not guessed.
ALTER TABLE folder_document_revision ADD COLUMN client TEXT NOT NULL DEFAULT '';
