-- A question an agent asks with options to pick from (claims.ask, `choices`): up to four, each a
-- label, a line saying more and a picture, as JSON. The question's own text says them too, so mail
-- and anything that reads only the text still has them; this is what the hub draws as buttons.
ALTER TABLE task_event ADD COLUMN choices TEXT NOT NULL DEFAULT '';
