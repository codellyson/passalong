-- Every guide says what kind it is.
--
-- An empty kind meant transfer, because transfers came first and never wrote `kind:`. Tasks are the
-- default now (docs/V2.md §11), so "absent" is no longer the obvious answer to read back. The
-- frontmatter rule for clients does not change: a guide with no `kind:` line is still a transfer,
-- and the API stores it as one, spelled out.
UPDATE guide SET kind = 'transfer' WHERE kind = '';
