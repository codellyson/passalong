-- What a guide is for, denormalized from `kind:` in its frontmatter.
--
-- Two values, and they ask opposite things of whoever receives one: a transfer guide is finished
-- work to repeat, a bug is a defect to fix. The receiving agent behaves completely differently
-- depending on which it is, so it is a field rather than something inferred from the body — see
-- KINDS in packages/passalong/src/guide.js.
--
-- Empty means transfer. Every guide written before this column existed is one, and defaulting the
-- other way would turn the whole table into bug reports.
ALTER TABLE guide ADD COLUMN kind TEXT NOT NULL DEFAULT '';
CREATE INDEX guide_kind ON guide(kind, created DESC);
