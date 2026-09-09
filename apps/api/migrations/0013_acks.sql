-- Acknowledgements: the receiver's answer to "are you doing this?", before any work happens.
--
-- The chain was shared → pulled → verdict, and the first hop had no signal at all. A guide handed
-- to someone sat as "in flight · not pulled yet · over a week", which cannot tell *hasn't noticed*
-- from *noticed, doing it Thursday* — so the product's advice was effectively "go and ask them on
-- Slack".
--
-- Deliberately not a status, for the same reasons migration 0004 gives for verdicts: this belongs
-- to the reader rather than the author, it can be negative, and several people on a team can each
-- answer about the same guide. And deliberately not in the markdown: the document is the author's,
-- while this is a fact about a transfer of it.
--
-- `taken = 0` is the valuable half. Declining used to be invisible — the guide simply rotted and
-- the sender found out in a week instead of in a minute — so a decline carries a required note and
-- puts the guide back in front of its author as something to re-home.
CREATE TABLE ack (
  guide_id   TEXT NOT NULL REFERENCES guide(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  taken      INTEGER NOT NULL,          -- 1 on it, 0 not me
  note       TEXT NOT NULL DEFAULT '',  -- required when declining; capped by the API
  at         TEXT NOT NULL,
  -- One standing answer per person per guide, like a verdict: changing your mind replaces what you
  -- said rather than adding to a pile, so "who has this?" always has one current answer each.
  PRIMARY KEY (guide_id, account_id)
);
CREATE INDEX ack_guide_at ON ack(guide_id, at DESC);
