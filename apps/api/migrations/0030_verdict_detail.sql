-- A verdict can say why, at the length that takes.
--
-- `note` is capped at NOTE_MAX — 280 characters — because it was written to be the one line a
-- board row shows. That is the whole reason a correction became a document: an agent that had run
-- the guide's Verification and found it did not hold had measurements, commands and commit ids to
-- report, and a tweet to report them in. So it published a guide instead, titled "Correction: the
-- tablet fix did not work in the real app", and hoped the next reader followed the link.
--
-- `detail` is that report, and `checks` is the same evidence sorted against the Verification line
-- each part answers — the shape migration 0028 gave a task and PR #45 gave a handoff. A failing
-- hand-in already collects both; until now they landed on the claim, where only the author sees
-- them, while the verdict kept a summary and the guide itself showed nothing at all.
--
-- `note` stays and stays short. It is what a row shows; these are what the guide shows.
ALTER TABLE verdict ADD COLUMN detail TEXT NOT NULL DEFAULT '';
ALTER TABLE verdict ADD COLUMN checks TEXT NOT NULL DEFAULT '';
