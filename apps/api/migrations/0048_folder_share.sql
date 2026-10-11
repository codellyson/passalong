-- A folder can be read through a secret link, the way a guide is (/f/:id/:key). Empty means not
-- shared: unlike a guide, a folder holds private files, so its link exists only once somebody asks
-- for one, and turning it off clears the key so every copy of the old link stops working.
ALTER TABLE folder ADD COLUMN share_key TEXT NOT NULL DEFAULT '';
