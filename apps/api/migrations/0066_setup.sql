-- First-run setup (docs/LOOP.md §0, build order step 3), remembered on the server so it resumes on
-- any device: a JSON object of the steps done and skipped, and whether the person put it away
-- (src/setup.ts reads and writes it; nothing else does). '' is a setup nobody has started.
--
-- Accounts already in a team when this ran set up the way there was, by hand, months ago; asking
-- them to "finish setting up" now would be news about nothing, so they start with it put away.
-- Like `grandfathered` (0016): a decision about people who have not arrived yet.
ALTER TABLE account ADD COLUMN setup TEXT NOT NULL DEFAULT '';
UPDATE account SET setup = '{"done":[],"skipped":[],"dismissed":true}'
  WHERE id IN (SELECT account_id FROM membership);
