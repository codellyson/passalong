-- Projects Passalong makes itself (2026-11-07): every piece of work lives in a project, and people
-- were not making them. `auto` is 'repo' for one made the first time work came from a repo no
-- project lists, 'default' for a team's General project (its work with no repo), '' for one a
-- person or agent made. `join_answered` is when someone answered "is this repo part of an existing
-- product?" for an automatic repo project, '' until then.
ALTER TABLE project ADD COLUMN auto TEXT NOT NULL DEFAULT '';
ALTER TABLE project ADD COLUMN join_answered TEXT NOT NULL DEFAULT '';
