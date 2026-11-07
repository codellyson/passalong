-- Whether a hand-in was an agent's (2026-11-07). An agent works as its person's account, so a proof
-- row named only the account, and the hub said "You: I changed…" over words the agent wrote. A hold
-- taken in the browser has an agent id starting `person-`; any other hold is an agent's.
ALTER TABLE proof ADD COLUMN agent INTEGER NOT NULL DEFAULT 0;

-- Past hand-ins: a check Passalong ran itself carries `cmd`, and only an agent's CLI runs one. The
-- rest stay as they were, since nothing recorded which they were.
UPDATE proof SET agent = 1 WHERE checks LIKE '%"cmd":%';
