-- What the live event stream (GET /v1/events, src/events.ts) asks every few seconds for every open
-- hub: which holds, verdicts and acks changed since a moment. Each of these tables was indexed only
-- by guide, so that question was a scan of the whole table per tick per open tab. An index on the
-- time each row last changed makes it a range read.
CREATE INDEX IF NOT EXISTS claim_updated ON claim(updated);
CREATE INDEX IF NOT EXISTS verdict_at ON verdict(at);
CREATE INDEX IF NOT EXISTS ack_at ON ack(at);
