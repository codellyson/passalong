-- A project's repo is a column (2026-10-30): one project per product or repo (docs/LOOP.md §0), and
-- the repo is what an agent asked to write its documents reads first. It was a `Repo:` line written
-- into a README stub during setup, which a person or agent could edit away and nothing could query.
-- '' is a project with no repo, which a marketing project is. Set by POST and PATCH /v1/folders
-- (repoOf() in folder-tree.ts), so the hub and both MCP servers carry it through the same routes.
ALTER TABLE folder ADD COLUMN repo TEXT NOT NULL DEFAULT '';
