-- What somebody had to adapt to make a guide work here.
--
-- A handoff that worked had three places to put an answer and none of them fit this. `ok` is a
-- boolean. `note` is capped at NOTE_MAX — 280 characters — because it is the one line a board row
-- shows. `evidence` is refused unless it is what you ran and what came back, and its own refusal
-- says so. An agent that followed a guide, landed it, and found that step 4 needed MAIL_FROM and
-- the bucket name on this codebase had nowhere to say that.
--
-- So it published a guide. That is where "The email step needs MAIL_FROM and the R2 bucket name"
-- comes from: a gotcha found while following a guide, given an id, a title, a share link and an
-- inbox row asking somebody to take it — when what it is, is a paragraph belonging to the guide it
-- was found in.
--
-- The pair matches `evidence` and `checks`, which migrations 0028 and 0030 put on both tables for
-- the same reason: the claim is what happened in one repo, and the verdict is what stands for the
-- guide. This is the third thing a hand-in carries, and the only one the next reader of the guide
-- is shown before they start.
ALTER TABLE claim ADD COLUMN writeup TEXT NOT NULL DEFAULT '';
ALTER TABLE verdict ADD COLUMN writeup TEXT NOT NULL DEFAULT '';
