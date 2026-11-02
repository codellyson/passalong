-- One thing: work (docs/WORK.md). Kinds, bug report sets, hand-in write-ups and the per-repo lock go.
--
-- Every step keeps what a person wrote. Nothing here deletes a guide: a write-up is a Done piece of
-- work like any other, a report becomes the parent piece of work its bugs were filed under, and of
-- several claims on one guide the most recently heard from is the one kept.

-- 1. `kind:` leaves every stored document. The server wrote it back on every publish as exactly
-- `kind: <k>` on a line of its own, so the first such line inside the frontmatter is the one; a line
-- in the body that happens to read the same is left alone.
UPDATE guide SET markdown = substr(markdown, 1, instr(markdown, char(10) || 'kind: task' || char(10)) - 1)
    || char(10) || substr(markdown, instr(markdown, char(10) || 'kind: task' || char(10)) + 12)
 WHERE instr(markdown, char(10) || 'kind: task' || char(10)) > 0
   AND instr(markdown, char(10) || 'kind: task' || char(10))
       < 3 + instr(substr(markdown, 4), char(10) || '---');
UPDATE guide SET markdown = substr(markdown, 1, instr(markdown, char(10) || 'kind: bug' || char(10)) - 1)
    || char(10) || substr(markdown, instr(markdown, char(10) || 'kind: bug' || char(10)) + 11)
 WHERE instr(markdown, char(10) || 'kind: bug' || char(10)) > 0
   AND instr(markdown, char(10) || 'kind: bug' || char(10))
       < 3 + instr(substr(markdown, 4), char(10) || '---');
UPDATE guide SET markdown = substr(markdown, 1, instr(markdown, char(10) || 'kind: transfer' || char(10)) - 1)
    || char(10) || substr(markdown, instr(markdown, char(10) || 'kind: transfer' || char(10)) + 16)
 WHERE instr(markdown, char(10) || 'kind: transfer' || char(10)) > 0
   AND instr(markdown, char(10) || 'kind: transfer' || char(10))
       < 3 + instr(substr(markdown, 4), char(10) || '---');

-- 2. A bug report set becomes the parent piece of work its bugs were filed under. It keeps the
-- report's id when no guide has it, so a link to the set still names it, and is given a fresh one
-- when one does. A set whose bugs are all Done is Done itself, finished, rather than a parent
-- sitting in To do that the untaken reminder would chase every day; every other set is Ready.
CREATE TABLE report_move (report_id TEXT PRIMARY KEY, guide_id TEXT NOT NULL, done INTEGER NOT NULL);
INSERT INTO report_move (report_id, guide_id, done)
  SELECT r.id,
         CASE WHEN EXISTS (SELECT 1 FROM guide g WHERE g.id = r.id)
              THEN lower(hex(randomblob(4))) ELSE r.id END,
         EXISTS (SELECT 1 FROM guide g WHERE g.report_id = r.id)
           AND NOT EXISTS (SELECT 1 FROM guide g WHERE g.report_id = r.id AND g.status <> 'consumed')
    FROM report r;

INSERT INTO guide (id, account_id, share_key, title, status, source_context, tags, stack, markdown,
                   created, updated, team_id, to_account_id, summary, outcome)
  SELECT m.guide_id, r.account_id, lower(hex(randomblob(11))),
         COALESCE(NULLIF(r.title, ''), 'Bugs filed together'),
         CASE WHEN m.done THEN 'consumed' ELSE 'published' END,
         r.environment, '["bug"]', '[]',
         '---' || char(10)
           || 'id: ' || m.guide_id || char(10)
           || 'title: "' || replace(COALESCE(NULLIF(r.title, ''), 'Bugs filed together'), '"', '\"') || '"' || char(10)
           || 'summary: "' || replace(
                (SELECT COUNT(*) FROM guide g WHERE g.report_id = r.id) || ' bugs filed together'
                  || CASE WHEN r.environment <> '' THEN ' on ' || r.environment ELSE '' END
                  || '. Each is its own piece of work, under this one.', '"', '\"') || '"' || char(10)
           || 'created: "' || r.created || '"' || char(10)
           || CASE WHEN r.environment <> '' THEN 'source_context: ' || r.environment || char(10) ELSE '' END
           || 'status: ' || CASE WHEN m.done THEN 'consumed' ELSE 'published' END || char(10)
           || COALESCE((SELECT 'team: ' || t.slug || char(10) FROM team t WHERE t.id = r.team_id), '')
           || CASE WHEN r.team_id <> '' AND r.to_account_id <> ''
                   THEN COALESCE((SELECT 'to: "@' || COALESCE(NULLIF(a.handle, ''), a.id) || '"' || char(10)
                                    FROM account a WHERE a.id = r.to_account_id), '')
                   ELSE '' END
           || 'stack_assumptions: []' || char(10)
           || 'tags: [bug]' || char(10)
           || '---' || char(10) || char(10)
           || 'These bugs were filed together'
           || CASE WHEN r.environment <> '' THEN ' on ' || r.environment ELSE '' END
           || '. Each one is its own piece of work, with this as its parent.' || char(10),
         r.created, r.updated, r.team_id,
         CASE WHEN r.team_id <> '' THEN r.to_account_id ELSE '' END,
         (SELECT COUNT(*) FROM guide g WHERE g.report_id = r.id) || ' bugs filed together'
           || CASE WHEN r.environment <> '' THEN ' on ' || r.environment ELSE '' END
           || '. Each is its own piece of work, under this one.',
         CASE WHEN m.done THEN 'finished' ELSE '' END
    FROM report r JOIN report_move m ON m.report_id = r.id;

-- Each bug names its set as its parent, in the column and in the document. The document's
-- `report: <id>` line becomes `parent: <id>`; a document that never had one gets the line at the
-- top of its frontmatter. A bug that already came out of other work keeps that parent.
UPDATE guide SET markdown = CASE
    WHEN instr(markdown, char(10) || 'report: ' || report_id || char(10)) > 0
      THEN replace(markdown, char(10) || 'report: ' || report_id || char(10),
                   char(10) || 'parent: ' || (SELECT m.guide_id FROM report_move m WHERE m.report_id = guide.report_id) || char(10))
    WHEN substr(markdown, 1, 4) = '---' || char(10)
      THEN '---' || char(10) || 'parent: ' || (SELECT m.guide_id FROM report_move m WHERE m.report_id = guide.report_id)
           || char(10) || substr(markdown, 5)
    ELSE markdown END,
  parent_id = (SELECT m.guide_id FROM report_move m WHERE m.report_id = guide.report_id)
 WHERE report_id IN (SELECT report_id FROM report_move) AND parent_id = '';

DROP TABLE report_move;
DROP TABLE report;

-- 3. One holder per piece of work. The lock was the guide in a place (0024_claim_place.sql); it is
-- the guide again. Where a handoff was held in several repos, the claim most recently heard from
-- stays. The write-up a hand-in named (`report_id`) goes with the column: a hand-in's own
-- `writeup` says it now. Nothing references `claim`.
CREATE TABLE claim_next (
  guide_id        TEXT PRIMARY KEY REFERENCES guide(id) ON DELETE CASCADE,
  account_id      TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL,
  host            TEXT NOT NULL DEFAULT '',
  repo            TEXT NOT NULL DEFAULT '',
  worktree        TEXT NOT NULL DEFAULT '',
  state           TEXT NOT NULL,
  note            TEXT NOT NULL DEFAULT '',
  pr              TEXT NOT NULL DEFAULT '',
  claimed_at      TEXT NOT NULL,
  lease_until     TEXT NOT NULL,
  updated         TEXT NOT NULL,
  evidence        TEXT NOT NULL DEFAULT '',
  checks          TEXT NOT NULL DEFAULT '',
  fence           INTEGER NOT NULL DEFAULT 0,
  writeup         TEXT NOT NULL DEFAULT '',
  risk            TEXT NOT NULL DEFAULT '',
  replied_through INTEGER NOT NULL DEFAULT 0
);
INSERT INTO claim_next (guide_id, account_id, agent_id, host, repo, worktree, state, note, pr,
                        claimed_at, lease_until, updated, evidence, checks, fence, writeup, risk,
                        replied_through)
  SELECT guide_id, account_id, agent_id, host, repo, worktree, state, note, pr,
         claimed_at, lease_until, updated, evidence, checks, fence, writeup, risk, replied_through
    FROM claim c
   WHERE NOT EXISTS (
     SELECT 1 FROM claim d
      WHERE d.guide_id = c.guide_id
        AND (d.updated > c.updated OR (d.updated = c.updated AND d.rowid > c.rowid)));
DROP TABLE claim;
ALTER TABLE claim_next RENAME TO claim;
CREATE INDEX claim_agent ON claim(agent_id, state);
CREATE INDEX claim_updated ON claim(updated);

-- The generation counter follows the lock: one per guide, at the highest it reached in any place,
-- so the next take is still above every number already handed out (0029_claim_fence.sql).
CREATE TABLE claim_fence_next (
  guide_id TEXT PRIMARY KEY REFERENCES guide(id) ON DELETE CASCADE,
  -- The last number handed out. The next claim gets held + 1.
  held     INTEGER NOT NULL
);
INSERT INTO claim_fence_next (guide_id, held)
  SELECT guide_id, MAX(held) FROM claim_fence GROUP BY guide_id;
DROP TABLE claim_fence;
ALTER TABLE claim_fence_next RENAME TO claim_fence;

-- A repeated alert merged by a fingerprint that began with its kind. It begins with its sender now,
-- so the open ones keep merging; where two kinds held the same alert, the first stays.
UPDATE OR IGNORE inbound_guide SET fingerprint = substr(fingerprint, instr(fingerprint, '|') + 1)
 WHERE fingerprint LIKE 'task|%' OR fingerprint LIKE 'bug|%' OR fingerprint LIKE 'transfer|%';

-- 4. The columns that held kinds, sets and write-ups. SQLite refuses to drop an indexed column, so
-- the indexes go first, and the queue's index comes back without `kind`.
DROP INDEX guide_kind;
DROP INDEX guide_report;
DROP INDEX guide_task_queue;
ALTER TABLE guide DROP COLUMN kind;
ALTER TABLE guide DROP COLUMN report_of;
ALTER TABLE guide DROP COLUMN report_id;
ALTER TABLE guide DROP COLUMN area;
ALTER TABLE guide DROP COLUMN severity;
CREATE INDEX guide_task_queue ON guide(status, target, created);
