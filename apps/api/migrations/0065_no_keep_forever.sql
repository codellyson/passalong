-- Proof clean-up is a fixed rule, not a choice (2026-10-30).
--
-- 0044 let an account turn off the two clocks that tidied its guides. One of them is gone — work
-- nobody took stays Ready and a person is told (docs/LOOP.md) — and the other, deleting the proof
-- screenshots on closed work PROOF_DAYS after it closed, now holds for every account: a switch that
-- kept storage forever for whoever found it, under a setting most people never opened, was a
-- second rule nobody could see. No index or constraint names the column, so it drops in place;
-- `account` is never rebuilt (AGENTS.md, "account.token_hash is retired, not gone").
ALTER TABLE account DROP COLUMN keep_forever;
