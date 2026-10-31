-- 1.0's words. Work, projects, documents, proof; the statuses Draft, Ready and Done; and the
-- notification kinds said the way the hub says them. Renames only: no table is rebuilt, so every
-- foreign key (rewritten by SQLite on rename) and every row stays where it is.

-- Tables.
ALTER TABLE guide RENAME TO work;
ALTER TABLE folder RENAME TO project;
ALTER TABLE folder_document RENAME TO document;
ALTER TABLE folder_document_revision RENAME TO document_revision;
ALTER TABLE folder_document_seen RENAME TO document_seen;
ALTER TABLE folder_asset RENAME TO project_file;
ALTER TABLE folder_guide RENAME TO project_work;
ALTER TABLE inbound_guide RENAME TO inbound_work;
ALTER TABLE verdict RENAME TO proof;

-- Columns.
ALTER TABLE pull RENAME COLUMN guide_id TO work_id;
ALTER TABLE notification RENAME COLUMN guide_id TO work_id;
ALTER TABLE proof RENAME COLUMN guide_id TO work_id;
ALTER TABLE shot RENAME COLUMN guide_id TO work_id;
ALTER TABLE task_block RENAME COLUMN guide_id TO work_id;
ALTER TABLE task_event RENAME COLUMN guide_id TO work_id;
ALTER TABLE attachment RENAME COLUMN guide_id TO work_id;
ALTER TABLE project_work RENAME COLUMN guide_id TO work_id;
ALTER TABLE project_work RENAME COLUMN folder_id TO project_id;
ALTER TABLE document RENAME COLUMN folder_id TO project_id;
ALTER TABLE project_file RENAME COLUMN folder_id TO project_id;
ALTER TABLE inbound_work RENAME COLUMN guide_id TO work_id;
ALTER TABLE claim RENAME COLUMN guide_id TO work_id;
ALTER TABLE claim_fence RENAME COLUMN guide_id TO work_id;

-- What a person said on work, a take or a pass, is on the thread (task_event, migration 0062).
DROP TABLE ack;

-- Indexes, under the names of what they index.
DROP INDEX guide_account_created;
CREATE INDEX work_account_created ON work(account_id, created DESC);
DROP INDEX guide_team_created;
CREATE INDEX work_team_created ON work(team_id, created DESC);
DROP INDEX guide_to;
CREATE INDEX work_to ON work(to_account_id);
DROP INDEX guide_group;
CREATE INDEX work_group ON work(to_group_id);
DROP INDEX guide_parent;
CREATE INDEX work_parent ON work(parent_id, created);
DROP INDEX guide_ref;
CREATE UNIQUE INDEX work_ref ON work(ref) WHERE ref <> '';
DROP INDEX guide_customer;
CREATE INDEX work_customer ON work(account_id, customer) WHERE customer <> '';
DROP INDEX guide_task_queue;
CREATE INDEX work_task_queue ON work(status, target, created);
DROP INDEX pull_guide_at;
CREATE INDEX pull_work_at ON pull(work_id, at DESC);
DROP INDEX verdict_guide_at;
CREATE INDEX proof_work_at ON proof(work_id, at DESC);
DROP INDEX verdict_at;
CREATE INDEX proof_at ON proof(at);
DROP INDEX task_event_guide;
CREATE INDEX task_event_work ON task_event(work_id, id);
DROP INDEX attachment_guide;
CREATE INDEX attachment_work ON attachment(work_id);
DROP INDEX folder_owner_updated;
CREATE INDEX project_owner_updated ON project(created_by, updated DESC);
DROP INDEX folder_team_updated;
CREATE INDEX project_team_updated ON project(team_id, updated DESC);
DROP INDEX folder_parent_updated;
CREATE INDEX project_parent_updated ON project(parent_id, updated DESC);
DROP INDEX folder_document_folder;
CREATE INDEX document_project ON document(project_id, updated DESC);
DROP INDEX folder_asset_folder;
CREATE INDEX project_file_project ON project_file(project_id, created DESC);
DROP INDEX folder_guide_guide;
CREATE INDEX project_work_work ON project_work(work_id);

-- Statuses, in the column and in the frontmatter line the stored markdown carries.
UPDATE work SET status = 'ready' WHERE status IN ('published', 'promoted');
UPDATE work SET status = 'done' WHERE status = 'consumed';
UPDATE work SET markdown = replace(replace(replace(markdown,
  char(10) || 'status: published' || char(10), char(10) || 'status: ready' || char(10)),
  char(10) || 'status: promoted' || char(10), char(10) || 'status: ready' || char(10)),
  char(10) || 'status: consumed' || char(10), char(10) || 'status: done' || char(10))
WHERE markdown LIKE '%status: published%' OR markdown LIKE '%status: promoted%'
   OR markdown LIKE '%status: consumed%';

-- Done says how: finished or archived. Work closed by the old approval was finished.
UPDATE work SET outcome = 'finished' WHERE outcome = 'approved';

-- A hand-in left waiting for a review that no longer exists is finished the way complete() in
-- claims.ts finishes one now: what it showed becomes its proof, the claim goes, the work is Done.
INSERT INTO proof (work_id, account_id, ok, note, detail, checks, writeup, at)
  SELECT work_id, account_id, 1, note, evidence, checks, writeup, updated FROM claim
   WHERE state = 'review'
  ON CONFLICT(work_id, account_id) DO UPDATE SET ok = excluded.ok, note = excluded.note,
    detail = excluded.detail, checks = excluded.checks,
    writeup = CASE WHEN excluded.writeup <> '' THEN excluded.writeup ELSE proof.writeup END,
    at = excluded.at;
UPDATE work SET status = 'done', outcome = 'finished',
  markdown = replace(markdown, char(10) || 'status: ready' || char(10), char(10) || 'status: done' || char(10))
WHERE status <> 'done' AND id IN (SELECT work_id FROM claim WHERE state = 'review');
DELETE FROM claim WHERE state = 'review';

-- Notification kinds. sent_back and reopened become one kind, so where a person already has both
-- for the same work and actor the older word goes; the unique index would refuse the pair.
DELETE FROM notification WHERE kind = 'sent_back' AND EXISTS (
  SELECT 1 FROM notification n WHERE n.kind = 'reopened' AND n.account_id = notification.account_id
     AND n.work_id = notification.work_id AND n.actor_id = notification.actor_id);
UPDATE notification SET kind = 'reopened' WHERE kind = 'sent_back';
UPDATE notification SET kind = 'sent_to_you' WHERE kind = 'handoff';
UPDATE notification SET kind = 'passed' WHERE kind = 'declined';
UPDATE notification SET kind = 'archived' WHERE kind = 'consumed';
UPDATE notification SET kind = 'made_admin' WHERE kind = 'promoted';
