-- Whether an account's guides are tidied away on a clock.
--
-- Two things happen to a guide by itself: a sent guide nobody touched is shelved after fourteen
-- days, and the screenshots that proved a closed guide's work are deleted five days after it was
-- closed. Both are right for most people and are the default (0). An account that would rather keep
-- everything sets this to 1 and neither happens to its guides. Who may set it is decided in
-- quota.ts (`mayKeep`), not here: the column only records the choice.
ALTER TABLE account ADD COLUMN keep_forever INTEGER NOT NULL DEFAULT 0;
