-- M6: a bug report is many guides with a parent.
--
-- The question this answers is whether one issue can be pulled and verified on its own, and the
-- answer is yes — so an issue *is* a guide. Same id, same share key, same `passalong pull`, same
-- verdict, same row on the board. Six bugs handed to a team are six things three people can take
-- and answer for separately, which is the whole point of the product; one guide holding six bugs
-- would have one verdict for all of them, and "four of these are fixed" has no way to be said.
--
-- The report is the parent that owns a set of them: a title, an environment, and who it went to.
CREATE TABLE report (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT '',
  environment   TEXT NOT NULL DEFAULT '',
  team_id       TEXT NOT NULL DEFAULT '',
  to_account_id TEXT NOT NULL DEFAULT '',
  created       TEXT NOT NULL,
  updated       TEXT NOT NULL
);
CREATE INDEX report_account_created ON report(account_id, created DESC);

-- Product area is deliberately not a table. It is a property of the issue that groups it inside
-- its report — the same call the board already makes, where a bucket is a GROUP BY and not four
-- columns. A new area costs a value, not a migration.
--
-- All three are denormalized from the issue's own frontmatter, exactly like title and tags are:
-- `report:`, `area:` and `severity:` are fields in the markdown, so an issue filed from the
-- browser is byte-for-byte the same document as one filed by the CLI, and neither surface needs
-- to know the other exists.
ALTER TABLE guide ADD COLUMN report_id TEXT NOT NULL DEFAULT '';
ALTER TABLE guide ADD COLUMN area      TEXT NOT NULL DEFAULT '';
ALTER TABLE guide ADD COLUMN severity  TEXT NOT NULL DEFAULT '';
CREATE INDEX guide_report ON guide(report_id, area);

-- Evidence. A guide travels as markdown and an image in markdown is a URL, so a screenshot needs
-- somewhere to live that outlasts the browser tab it was dropped into. The bytes are in R2; this
-- is what says whose they are and what the issue calls them.
CREATE TABLE shot (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  guide_id   TEXT NOT NULL DEFAULT '',
  name       TEXT NOT NULL DEFAULT '',
  type       TEXT NOT NULL,
  bytes      INTEGER NOT NULL DEFAULT 0,
  created    TEXT NOT NULL
);
CREATE INDEX shot_account_created ON shot(account_id, created DESC);
