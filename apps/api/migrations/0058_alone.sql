-- A task a person has said may run with nobody watching (docs/LOOP.md §1a, problem 3). The hosted
-- runner (`passalong work --watch`) takes only these. A column a person sets in the hub, never
-- frontmatter: whether work is safe to run alone is a judgement about this team's risk, not part of
-- the work's description, and it must not travel with a share link or be re-published by an agent.
-- 0 is "not marked", which is what every task was before; the runner reads nothing into it but no.
ALTER TABLE guide ADD COLUMN alone INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guide ADD COLUMN alone_by TEXT NOT NULL DEFAULT '';
