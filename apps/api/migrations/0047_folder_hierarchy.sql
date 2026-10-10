-- A folder can sit inside another folder in the same private or team space.
-- Empty color means neutral; nested folders may inherit their parent's visual color in the hub.
ALTER TABLE folder ADD COLUMN parent_id TEXT NOT NULL DEFAULT '';
ALTER TABLE folder ADD COLUMN color TEXT NOT NULL DEFAULT '';
CREATE INDEX folder_parent_updated ON folder(parent_id, updated DESC);
