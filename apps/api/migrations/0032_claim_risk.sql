-- What the person handing work in thinks it could break.
--
-- Taken from the PR template the team already uses, and the one part of it a hand-in had no place
-- for: `checks` answers "how did you verify it", `writeup` answers "what changed", and neither says
-- where to look if it goes wrong. That is the author's question at review, so it lives on the claim
-- — what happened in one repo — and is not shown to the next reader of the guide.
--
-- Optional on purpose. A risk line that must be filled is filled with "low risk" every time.
ALTER TABLE claim ADD COLUMN risk TEXT NOT NULL DEFAULT '';
