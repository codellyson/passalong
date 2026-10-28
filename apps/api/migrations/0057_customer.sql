-- The customer on a support request (docs/LOOP.md §4): who wrote in, and the tracking number they
-- were given. Columns, never frontmatter: a field in the document travels with every share link and
-- every agent that reads it, and the customer's address must not. `ref` is the tracking number —
-- its own value, not the guide's id, so it opens nothing on its own — and is unique where set.
-- A reply joins a request only when it carries `ref` and comes from `customer`.
ALTER TABLE guide ADD COLUMN customer TEXT NOT NULL DEFAULT '';
ALTER TABLE guide ADD COLUMN customer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE guide ADD COLUMN ref TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX guide_ref ON guide(ref) WHERE ref <> '';
CREATE INDEX guide_customer ON guide(account_id, customer) WHERE customer <> '';
