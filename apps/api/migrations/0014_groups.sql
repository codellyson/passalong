-- Groups: a named subset of a team, so a guide can be handed to the people who do a thing rather
-- than to one person or to everybody.
--
-- Addressing had two settings and needed a third. `to: @hybee1` picks a person, which is precise
-- and wrong when you do not know who is free; leaving it off shares with the whole team, which is
-- imprecise and reaches people it has nothing to do with. Both failure modes end the same way —
-- the guide sits in a lane nobody treats as theirs.
--
-- A group is scoped to its team and named with a slug, because it is written in frontmatter by
-- hand: `to: khaime/#frontend` has to be typed correctly by a person or an agent, so it is a word
-- rather than an id. Membership is a plain join table; there are no roles inside a group, because
-- a group is an address and not a permission.
CREATE TABLE team_group (
  id      TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  slug    TEXT NOT NULL,
  name    TEXT NOT NULL DEFAULT '',
  created TEXT NOT NULL,
  UNIQUE (team_id, slug)
);

CREATE TABLE group_member (
  group_id   TEXT NOT NULL REFERENCES team_group(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, account_id)
);
CREATE INDEX group_member_account ON group_member(account_id);

-- The third addressing column, beside team_id and to_account_id. Empty means the guide is not
-- addressed to a group, which is every guide written before this existed.
--
-- Deliberately not folded into to_account_id: a group is not an account, the inbox has to ask a
-- different question of each ("is this me" versus "am I in this"), and one column holding either
-- would make every one of those queries guess which kind of id it was looking at.
ALTER TABLE guide ADD COLUMN to_group_id TEXT NOT NULL DEFAULT '';
CREATE INDEX guide_group ON guide(to_group_id);
