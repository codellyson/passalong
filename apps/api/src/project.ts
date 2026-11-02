// One project's work and history, for its page in the hub (`GET /v1/projects/:id/project`).
//
// A project is a project and every project beneath it. Its work is what is linked into any of them,
// as register rows (who has it, its state, how old it is, what changed since you looked); its
// history is one time-ordered list of work finished and document versions saved. It owns no table:
// every line is derived from project_work, work, claim, task_event, proof and the document
// revisions, so it cannot disagree with the board or the document's own history.
//
// Imports no sibling, so test/project.test.mjs can run it against real SQLite with every migration.
// `changed` is the raw notification kind; the route turns it into words with needs.ts's changeWords.

export interface WorkRow {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  /** The board's stage: draft, todo, working, done. */
  stage: "draft" | "todo" | "working" | "done";
  /** How the hold is doing, only while someone holds it: asking, quiet, working. */
  health: "" | "asking" | "quiet" | "working";
  /** Who has it: the agent or person holding it, who it was sent to, or who finished it. */
  with: string;
  /** Age is measured from here: when it was taken, finished, or written. */
  since: string;
  /** Done only: finished or archived. */
  outcome: string;
  changed: string;
}

export interface HistoryItem {
  kind: "finished" | "document";
  at: string;
  /** Who did it: an agent's id, or a person's name or @handle. */
  by: string;
  /** "agent" or "person" when known; "" for document saves from before it was recorded. */
  via: "agent" | "person" | "";
  /**
   * Changed since the reader last looked. Finished work: the raw notification kind, as on work rows.
   * A document version: "version 3 by Bola" when someone else saved it after the reader last opened
   * that document; "" otherwise.
   */
  changed: string;
  /** Finished work: the work; a document version: the document. */
  id: string;
  title: string;
  /** The project the document is in, for its link. */
  project: string;
  version: number;
  /** Finished work: the hand-in's own words, and what was shown. */
  note: string;
  shots: number;
  checks: number;
}

/** Done work stays under "Done recently" this long. */
export const DONE_DAYS = 14;
const HISTORY_MAX = 100;

/**
 * What saved a version, as a person or an agent: the hub's session is a person's hand, MCP and the
 * CLI are agents'. `api` is a bare token (a script, or a person signed in by a token link) and ''
 * predates the column: both are unknown, not guessed.
 */
export const viaOf = (client: string): HistoryItem["via"] =>
  client === "hub" ? "person" : client === "mcp" || client.startsWith("cli@") ? "agent" : "";

/** Who saved version `r`, as person() says it: a name, else @handle, else @id. */
export const SAVER = `COALESCE(NULLIF(a.name, ''), '@' || NULLIF(a.handle, ''), '@' || r.saved_by)`;

/**
 * SQL for what changed in document `d` since account `acc` (a bound parameter, e.g. "?1") last
 * opened it: "version 3 by Bola" for the newest version someone else saved after that, or ''. The
 * one definition of a changed document, read by the project list, a project's read and its history.
 */
export const docChange = (acc: string) => `COALESCE((
  SELECT 'version ' || r.version || ' by ' || ${SAVER}
    FROM document_revision r LEFT JOIN account a ON a.id = r.saved_by
   WHERE r.document_id = d.id AND r.saved_by <> ${acc}
     AND r.saved_at > COALESCE((SELECT s.at FROM document_seen s
                                 WHERE s.account_id = ${acc} AND s.document_id = d.id), '')
   ORDER BY r.version DESC LIMIT 1), '')`;

/** Opening a document, or saving it, is looking at it: its mark clears for that account. */
export const seeDocument = (db: D1Database, account: string, document: string, at: string) =>
  db
    .prepare(
      `INSERT INTO document_seen (account_id, document_id, at) VALUES (?, ?, ?)
       ON CONFLICT(account_id, document_id) DO UPDATE SET at = excluded.at`,
    )
    .bind(account, document, at)
    .run();

/** "Mark all seen": every document the account can read counts as looked at now. */
export const seeAllDocuments = (db: D1Database, account: string, at: string) =>
  db
    .prepare(
      `INSERT INTO document_seen (account_id, document_id, at)
       SELECT ?1, d.id, ?2 FROM document d JOIN project f ON f.id = d.project_id
        WHERE (f.team_id = '' AND f.created_by = ?1)
           OR f.team_id IN (SELECT team_id FROM membership WHERE account_id = ?1)
       ON CONFLICT(account_id, document_id) DO UPDATE SET at = excluded.at`,
    )
    .bind(account, at)
    .run();

const person = (name: string, handle: string, id: string) =>
  name.trim() || (handle ? `@${handle}` : id ? `@${id}` : "");
const holderOf = (agent: string, name: string, handle: string, account: string) =>
  agent.startsWith("person-") ? person(name, handle, account) : agent;

export async function projectView(
  db: D1Database,
  account: string,
  project: string,
  at: string,
): Promise<{ open: WorkRow[]; done: WorkRow[]; history: HistoryItem[] }> {
  const q = <T>(sql: string, ...binds: (string | number)[]) =>
    db
      .prepare(sql)
      .bind(...binds)
      .all<T>()
      .then((r) => r.results);
  const SUBTREE = `WITH RECURSIVE subtree(id) AS (
      SELECT id FROM project WHERE id = ?2
      UNION ALL SELECT f.id FROM project f JOIN subtree s ON f.parent_id = s.id)`;

  type Raw = {
    id: string;
    title: string;
    summary: string;
    tags: string;
    status: string;
    outcome: string;
    created: string;
    updated: string;
    changed: string;
    agent_id: string | null;
    holder: string | null;
    holder_name: string;
    holder_handle: string;
    claimed_at: string | null;
    lease_until: string | null;
    asking: number;
    to_handle: string;
    to_group: string;
    fin_agent: string;
    fin_account: string;
    fin_name: string;
    fin_handle: string;
    fin_at: string;
  };
  const [work, finished, docs] = await Promise.all([
    q<Raw>(
      `${SUBTREE}
       SELECT g.id, g.title, g.summary, g.tags, g.status, g.outcome, g.created, g.updated,
              COALESCE((SELECT n.kind FROM notification n WHERE n.account_id = ?1 AND n.work_id = g.id
                         AND n.read_at = '' ORDER BY n.at DESC LIMIT 1), '') AS changed,
              c.agent_id, c.account_id AS holder, COALESCE(ha.name, '') AS holder_name,
              COALESCE(ha.handle, '') AS holder_handle, c.claimed_at, c.lease_until,
              EXISTS (SELECT 1 FROM task_event x WHERE x.work_id = g.id AND x.kind = 'asked'
                       AND c.claimed_at IS NOT NULL AND x.at >= c.claimed_at
                       AND NOT EXISTS (SELECT 1 FROM task_event r WHERE r.work_id = g.id
                                        AND r.kind = 'replied' AND r.id > x.id)) AS asking,
              COALESCE(ta.handle, '') AS to_handle, COALESCE(tg.slug, '') AS to_group,
              COALESCE(fe.agent_id, '') AS fin_agent, COALESCE(fe.account_id, '') AS fin_account,
              COALESCE(fa.name, '') AS fin_name, COALESCE(fa.handle, '') AS fin_handle,
              COALESCE(fe.at, '') AS fin_at
         FROM work g
         LEFT JOIN claim c ON c.work_id = g.id AND c.state = 'claimed'
         LEFT JOIN account ha ON ha.id = c.account_id
         LEFT JOIN account ta ON ta.id = g.to_account_id AND g.to_account_id <> ''
         LEFT JOIN team_group tg ON tg.id = g.to_group_id AND g.to_group_id <> ''
         LEFT JOIN task_event fe ON fe.id = (SELECT MAX(x.id) FROM task_event x
                                              WHERE x.work_id = g.id AND x.kind = 'handed_in')
         LEFT JOIN account fa ON fa.id = fe.account_id
        WHERE g.id IN (SELECT work_id FROM project_work WHERE project_id IN (SELECT id FROM subtree))
          AND (g.status <> 'done'
               OR g.updated >= strftime('%Y-%m-%dT%H:%M:%fZ', ?3, '-${DONE_DAYS} days'))
        `,
      account,
      project,
      at,
    ),
    // Work finished in the project, ever, with what its finisher showed.
    q<{
      id: string;
      title: string;
      at: string;
      agent_id: string;
      by_id: string;
      by_name: string;
      by_handle: string;
      note: string;
      detail: string;
      checks: string;
      changed: string;
    }>(
      `${SUBTREE}
       SELECT g.id, g.title, COALESCE(e.at, g.updated) AS at,
              COALESCE((SELECT n.kind FROM notification n WHERE n.account_id = ?1 AND n.work_id = g.id
                         AND n.read_at = '' ORDER BY n.at DESC LIMIT 1), '') AS changed, COALESCE(e.agent_id, '') AS agent_id,
              COALESCE(e.account_id, '') AS by_id, COALESCE(a.name, '') AS by_name,
              COALESCE(a.handle, '') AS by_handle, COALESCE(NULLIF(v.writeup, ''), v.note, e.body, '') AS note,
              COALESCE(v.detail, '') AS detail, COALESCE(v.checks, '') AS checks
         FROM work g
         LEFT JOIN task_event e ON e.id = (SELECT MAX(x.id) FROM task_event x
                                             WHERE x.work_id = g.id AND x.kind = 'handed_in')
         LEFT JOIN account a ON a.id = e.account_id
         LEFT JOIN proof v ON v.work_id = g.id AND v.account_id = e.account_id
        WHERE g.id IN (SELECT work_id FROM project_work WHERE project_id IN (SELECT id FROM subtree))
          AND g.status = 'done' AND g.outcome = 'finished'
        ORDER BY at DESC LIMIT ?3`,
      account,
      project,
      HISTORY_MAX,
    ),
    // Every saved version of every document in the project.
    q<{
      id: string;
      name: string;
      project_id: string;
      version: number;
      saved_at: string;
      client: string;
      saved_by: string;
      by_name: string;
      by_handle: string;
      seen_at: string;
    }>(
      `${SUBTREE}
       SELECT d.id, d.name, d.project_id, r.version, r.saved_at, r.client, r.saved_by,
              COALESCE(a.name, '') AS by_name, COALESCE(a.handle, '') AS by_handle,
              COALESCE((SELECT s.at FROM document_seen s
                         WHERE s.account_id = ?1 AND s.document_id = d.id), '') AS seen_at
         FROM document_revision r
         JOIN document d ON d.id = r.document_id
         LEFT JOIN account a ON a.id = r.saved_by
        WHERE d.project_id IN (SELECT id FROM subtree)
        ORDER BY r.saved_at DESC LIMIT ?3`,
      account,
      project,
      HISTORY_MAX,
    ),
  ]);

  const row = (r: Raw): WorkRow => {
    const done = r.status === "done";
    const held = Boolean(r.agent_id) && !done;
    const stage = done ? "done" : r.status === "draft" ? "draft" : held ? "working" : "todo";
    const tags = (() => {
      try {
        return JSON.parse(r.tags || "[]") as string[];
      } catch {
        return [];
      }
    })();
    return {
      id: r.id,
      title: r.title,
      summary: r.summary || "",
      tags,
      stage,
      health: !held
        ? ""
        : r.asking
          ? "asking"
          : !(r.agent_id || "").startsWith("person-") && (r.lease_until || "") <= at
            ? "quiet"
            : "working",
      with: done
        ? r.fin_agent && !r.fin_agent.startsWith("person-")
          ? r.fin_agent
          : person(r.fin_name, r.fin_handle, r.fin_account)
        : held
          ? holderOf(r.agent_id || "", r.holder_name, r.holder_handle, r.holder || "")
          : r.to_handle
            ? `@${r.to_handle}`
            : r.to_group
              ? `#${r.to_group}`
              : "",
      since: done ? r.fin_at || r.updated : held ? r.claimed_at || r.created : r.created,
      outcome: done ? r.outcome : "",
      changed: r.changed,
    };
  };
  const rows = work.map(row);
  // What waits on someone first (a question, a hold gone quiet), then the oldest.
  const weight = (w: WorkRow) =>
    w.health === "asking" ? 0 : w.health === "quiet" ? 1 : w.stage === "draft" ? 3 : 2;
  const open = rows
    .filter((w) => w.stage !== "done")
    .sort((a, b) => weight(a) - weight(b) || a.since.localeCompare(b.since));
  const done = rows
    .filter((w) => w.stage === "done")
    .sort((a, b) => b.since.localeCompare(a.since));

  const count = (s: string, re: RegExp) => (s.match(re) || []).length;
  const checksIn = (raw: string) => {
    try {
      const v = JSON.parse(raw || "[]");
      return Array.isArray(v) ? v.length : 0;
    } catch {
      return 0;
    }
  };
  const history: HistoryItem[] = [
    ...finished.map(
      (f): HistoryItem => ({
        kind: "finished",
        at: f.at,
        by:
          f.agent_id && !f.agent_id.startsWith("person-")
            ? f.agent_id
            : person(f.by_name, f.by_handle, f.by_id),
        via: !f.agent_id ? "" : f.agent_id.startsWith("person-") ? "person" : "agent",
        changed: f.changed,
        id: f.id,
        title: f.title,
        project: "",
        version: 0,
        note: f.note
          .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 240),
        shots: count(`${f.detail} ${f.note}`, /\/v1\/shots\/[a-z0-9]+/gi),
        checks: checksIn(f.checks),
      }),
    ),
    ...docs.map(
      (d): HistoryItem => ({
        kind: "document",
        at: d.saved_at,
        by: person(d.by_name, d.by_handle, d.saved_by),
        via: viaOf(d.client),
        changed:
          d.saved_by !== account && d.saved_at > d.seen_at
            ? `version ${d.version} by ${person(d.by_name, d.by_handle, d.saved_by) || "someone"}`
            : "",
        id: d.id,
        title: d.name,
        project: d.project_id,
        version: d.version,
        note: "",
        shots: 0,
        checks: 0,
      }),
    ),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, HISTORY_MAX);

  return { open, done, history };
}
