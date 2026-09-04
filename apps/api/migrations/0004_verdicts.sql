-- Verdicts: someone tried the work and says whether it holds up.
--
-- Deliberately not a guide status. `status` is the guide's lifecycle and the author owns it, it
-- lives inside the markdown, and it holds one value — none of which fits a judgement that belongs
-- to the reader, can be negative, and can be given by several people about the same guide. So a
-- verdict is a row of its own, like a pull.
--
-- `note` is capped by the API rather than the schema; it exists so "it doesn't work" can say what
-- happened. It is one line, not a thread: comments are out of scope on purpose.

CREATE TABLE verdict (
  guide_id   TEXT NOT NULL REFERENCES guide(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  ok         INTEGER NOT NULL,         -- 1 it works, 0 it does not
  note       TEXT NOT NULL DEFAULT '',
  at         TEXT NOT NULL,
  -- One standing verdict per person per guide: trying again replaces your answer rather than
  -- adding to a pile, so "does this work?" always has one current answer from each verifier.
  PRIMARY KEY (guide_id, account_id)
);
CREATE INDEX verdict_guide_at ON verdict(guide_id, at DESC);

-- A notification can now carry one line of context. Only verdicts use it so far ("it doesn't
-- work" is useless without saying how), but the column is generic on purpose: the alternative
-- was joining verdict into the feed query for two of seven kinds.
ALTER TABLE notification ADD COLUMN note TEXT NOT NULL DEFAULT '';
