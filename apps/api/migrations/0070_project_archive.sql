-- A project put away rather than deleted: when it was archived, '' while it is in use. Archived
-- projects leave the lists people and agents see, keep everything in them, and can be brought
-- back. Archiving a project archives the projects inside it too, as deleting does.
ALTER TABLE project ADD COLUMN archived TEXT NOT NULL DEFAULT '';
