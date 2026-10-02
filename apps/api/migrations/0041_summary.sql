-- What a guide says to a person, denormalised from `summary:` in its frontmatter.
--
-- The document is the agent's form: exact, dense, full of ids and paths. This is the human one, a
-- sentence or two, and a list of guides has to show it without opening every document — the same
-- reason `kind` and `target` are columns (migrations 0007 and 0021).
--
-- Empty for every guide written before summaries existed, and that is a state, not a default: the
-- hub falls back to what it showed before, and a client that writes such a guide again without one
-- is let through (a new guide may not be). See `summaryProblem()` in src/guide.ts.
ALTER TABLE guide ADD COLUMN summary TEXT NOT NULL DEFAULT '';
