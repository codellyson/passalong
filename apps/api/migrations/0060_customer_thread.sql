-- One conversation in the customer's inbox (docs/LOOP.md): the subject they wrote under, which every
-- mail back to them answers, and the Message-IDs of what they sent, which our mail names in
-- In-Reply-To and References and their replies name back.
ALTER TABLE guide ADD COLUMN customer_subject TEXT NOT NULL DEFAULT '';
ALTER TABLE guide ADD COLUMN customer_mids TEXT NOT NULL DEFAULT '';
