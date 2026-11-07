-- The work list and the board read whole tables on every load (2026-11-08). Production logs showed
-- GET /v1/work at about 5s of database time in 30 queries and GET /v1/board at about 3s; the
-- database runs one query at a time, so everything else waited behind them (a webhook among it,
-- past its sender's 5-second limit).
-- A work's screenshots, for the list's preview images: `shot` had no index on work_id.
CREATE INDEX IF NOT EXISTS shot_work ON shot(work_id, created);
-- Work this account passed on, which leaves its board: task_event had no index by account.
CREATE INDEX IF NOT EXISTS task_event_account_kind ON task_event(account_id, kind, work_id);
