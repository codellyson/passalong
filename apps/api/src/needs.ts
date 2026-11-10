// What waits on one person, ranked: the hub's first screen (`GET /v1/needs`).
//
// One read rather than five on the client, because the ranking is a statement about the product —
// an agent's question outranks a hold gone quiet, which outranks work nobody took — and a rule
// like that belongs in one place. Each piece of work appears once, under the most pressing reason
// it has. It owns no table: every row is derived from work, claim, task_event and notification,
// so it cannot disagree with the board.
//
// Imports no sibling, so test/needs.test.mjs can run it against real SQLite with every migration.

/** Why a row is waiting on you, most pressing first. The order is the rank. */
export const REASONS = ["asking", "stuck", "untaken", "came_back"] as const;
export type Reason = (typeof REASONS)[number];

export interface Project {
  id: string;
  title: string;
  color: string;
}

export interface NeedRow {
  id: string;
  title: string;
  summary: string;
  reason: Reason;
  /** Who the work is with: the agent or person holding it, who passed it back. */
  with: string;
  /** Since when it has waited on you. Age is measured from here. */
  since: string;
  /** The question asked, or the reason it came back, when there is one. */
  said: string;
  /**
   * A question's options (claims.ask `choices`), so the row offers them as cards to pick from right
   * here, without opening anything. Only on `asking` rows whose question offered some.
   */
  choices?: { label: string; detail: string; picture: string }[];
  project: Project | null;
  /** What changed since you last looked, in a few words; '' when nothing unread is on it. */
  changed: string;
}

export interface Closed {
  id: string;
  title: string;
  summary: string;
  by: string;
  at: string;
  project: Project | null;
  changed: string;
}

/** Readable by this account: its own, or its teams'. Binds ?1. */
const VISIBLE = `(g.account_id = ?1 OR (g.team_id <> '' AND g.team_id IN
  (SELECT team_id FROM membership WHERE account_id = ?1)))`;

/** The latest unread notification on the work for ?1: what makes a row "changed". */
const CHANGED = `COALESCE((SELECT n.kind FROM notification n
  WHERE n.account_id = ?1 AND n.work_id = g.id AND n.read_at = ''
  ORDER BY n.at DESC LIMIT 1), '')`;

/**
 * A few words for the change mark, one per notification kind, so the mark always names what
 * changed. A kind added to notify.ts later and not here still marks the row, as "Changed".
 */
const CHANGE_WORDS: Record<string, string> = {
  sent_to_you: "Sent to you",
  shared: "Shared",
  passed: "Passed back",
  pulled: "Opened",
  archived: "Archived",
  reopened: "Reopened",
  joined: "Someone joined",
  made_admin: "Made admin",
  removed: "Removed",
  task_claimed: "Taken",
  task_finished: "Finished",
  task_released: "Let go",
  reassigned: "Given to you",
  stalled: "Went quiet",
  shelved: "Moved to Draft",
  still_draft: "Still a draft",
  requeued: "Back in the queue",
  stuck: "Stuck",
  untaken: "Nobody took it",
  // About an account or a plan rather than one piece of work, so rarely on a row; worded anyway.
  near_limit: "Near the free limit",
  at_limit: "At the free limit",
  plan_ending: "Plan ending",
  reader_unsure: "Needs a look",
  child_done: "Follow-up finished",
  asked: "New question",
  replied: "New reply",
  said: "Team talk",
  blocked: "Blocked",
  signed_up: "Signed up",
  billed_twice: "Billed twice",
  half_set: "Settings half set",
  emailed: "Came in by email",
  email_sender: "New sender",
  hooked: "Came in from an alert",
};
export const changeWords = (kind: string) => (kind ? CHANGE_WORDS[kind] || "Changed" : "");

const person = (name: string, handle: string, id: string) =>
  name.trim() || (handle ? `@${handle}` : id ? `@${id}` : "");

/**
 * An agent as a person reads it: whose it is, never its id or its machine. Its id is a random string
 * ("e6080e2ab4…") that told nobody which agent was asking (2026-11-06), and a machine name is the
 * same kind of detail: no hostnames on the pages people read (2026-11-07). `host` is kept in the
 * signature for the callers, which still read it for the agent itself.
 */
export const agentName = (owner: string, _host: string, mine = false) => {
  if (mine) return "Your agent";
  if (owner) return `${owner}'s agent`;
  return "An agent";
};

/** Closed work stays in the column this long. */
export const CLOSED_DAYS = 7;

export async function needs(
  db: D1Database,
  account: string,
  at: string,
): Promise<{ rows: NeedRow[]; closed: Closed[] }> {
  const q = <T>(sql: string, ...binds: string[]) =>
    db
      .prepare(sql)
      .bind(...binds)
      .all<T>()
      .then((r) => r.results);

  type Base = { id: string; title: string; summary: string; changed: string };
  const [held, untaken, back, closed] = await Promise.all([
    // Held work an agent is asking about, or that went quiet: the holder's own account and the
    // author are the people it waits on.
    q<
      Base & {
        lease_until: string;
        host: string;
        asking: string;
        asked_at: string;
        choices: string;
        by_name: string;
        by_handle: string;
        agent_id: string;
        holder: string;
      }
    >(
      `SELECT g.id, g.title, g.summary, ${CHANGED} AS changed, c.lease_until, c.agent_id, c.host,
              c.account_id AS holder, COALESCE(a.name, '') AS by_name, COALESCE(a.handle, '') AS by_handle,
              COALESCE(e.body, '') AS asking, COALESCE(e.at, '') AS asked_at,
              COALESCE(e.choices, '') AS choices
         FROM claim c JOIN work g ON g.id = c.work_id
         LEFT JOIN account a ON a.id = c.account_id
         LEFT JOIN task_event e ON e.id = (SELECT x.id FROM task_event x
            WHERE x.work_id = c.work_id AND x.kind = 'asked' AND x.at >= c.claimed_at
              AND NOT EXISTS (SELECT 1 FROM task_event r WHERE r.work_id = x.work_id
                               AND r.kind = 'replied' AND r.id > x.id)
            ORDER BY x.id DESC LIMIT 1)
        WHERE c.state = 'claimed' AND g.status <> 'done'
          AND (c.account_id = ?1 OR g.account_id = ?1)
          AND (e.id IS NOT NULL OR c.lease_until <= ?2)`,
      account,
      at,
    ),
    // Sent to you, or to a group you are in, that nobody has taken.
    q<Base & { created: string; group_slug: string }>(
      `SELECT g.id, g.title, g.summary, ${CHANGED} AS changed, g.created,
              COALESCE(tg.slug, '') AS group_slug
         FROM work g LEFT JOIN team_group tg ON tg.id = g.to_group_id AND g.to_group_id <> ''
        WHERE g.status = 'ready'
          AND (g.to_account_id = ?1 OR (g.to_group_id <> '' AND g.to_group_id IN
                 (SELECT group_id FROM group_member WHERE account_id = ?1)))
          AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.work_id = g.id)`,
      account,
    ),
    // Yours, and the last thing that happened to it is somebody else passing it back or reopening it.
    q<
      Base & {
        kind: string;
        body: string;
        at: string;
        by_name: string;
        by_handle: string;
        by_id: string;
      }
    >(
      `SELECT g.id, g.title, g.summary, ${CHANGED} AS changed, e.kind, e.body, e.at,
              e.account_id AS by_id, COALESCE(a.name, '') AS by_name, COALESCE(a.handle, '') AS by_handle
         FROM work g
         JOIN task_event e ON e.id = (SELECT MAX(x.id) FROM task_event x WHERE x.work_id = g.id
                                        AND x.kind NOT IN ('progress', 'noted'))
         LEFT JOIN account a ON a.id = e.account_id
        WHERE g.account_id = ?1 AND g.status = 'ready'
          AND e.kind IN ('passed', 'reopened') AND e.account_id <> ?1
          AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.work_id = g.id)`,
      account,
    ),
    // Finished lately, by whoever handed it in.
    q<
      Base & {
        updated: string;
        agent_id: string;
        host: string;
        by_name: string;
        by_handle: string;
        by_id: string;
      }
    >(
      `SELECT g.id, g.title, g.summary, ${CHANGED} AS changed, g.updated,
              COALESCE(e.agent_id, '') AS agent_id, COALESCE(e.host, '') AS host,
              COALESCE(e.account_id, '') AS by_id,
              COALESCE(a.name, '') AS by_name, COALESCE(a.handle, '') AS by_handle
         FROM work g
         LEFT JOIN task_event e ON e.id = (SELECT MAX(x.id) FROM task_event x
                                             WHERE x.work_id = g.id AND x.kind = 'handed_in')
         LEFT JOIN account a ON a.id = e.account_id
        WHERE g.status = 'done' AND g.outcome = 'finished' AND ${VISIBLE}
          AND g.updated >= strftime('%Y-%m-%dT%H:%M:%fZ', ?2, '-${CLOSED_DAYS} days')
        ORDER BY g.updated DESC LIMIT 8`,
      account,
      at,
    ),
  ]);

  const projects = await projectsOf(db, account, [
    ...new Set([...held, ...untaken, ...back, ...closed].map((r) => r.id)),
  ]);
  const projectOf = (id: string) => projects.get(id) ?? null;

  const rows: NeedRow[] = [];
  const seen = new Set<string>();
  const add = (
    r: Base,
    rest: Omit<NeedRow, "id" | "title" | "summary" | "project" | "changed">,
  ) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    rows.push({
      id: r.id,
      title: r.title,
      summary: r.summary || "",
      project: projectOf(r.id),
      changed: changeWords(r.changed),
      ...rest,
    });
  };

  const holder = (r: (typeof held)[number]) =>
    r.agent_id.startsWith("person-")
      ? person(r.by_name, r.by_handle, r.holder)
      : agentName(person(r.by_name, r.by_handle, r.holder), r.host, r.holder === account);
  // A question with options says only the question; its options travel as `choices`, to be picked.
  const options = (raw: string): NonNullable<NeedRow["choices"]> => {
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };
  for (const r of held
    .filter((h) => h.asking)
    .sort((a, b) => a.asked_at.localeCompare(b.asked_at))) {
    const choices = options(r.choices).map((o) => ({
      ...o,
      picture: o.picture.replace(/^https?:\/\/[^/]+/, ""),
    }));
    add(r, {
      reason: "asking",
      with: holder(r),
      since: r.asked_at,
      said: choices.length ? (r.asking.split("\n\nThe choices:")[0] ?? r.asking) : r.asking,
      ...(choices.length ? { choices } : {}),
    });
  }
  for (const r of held.sort((a, b) => a.lease_until.localeCompare(b.lease_until)))
    add(r, { reason: "stuck", with: holder(r), since: r.lease_until, said: "" });
  for (const r of untaken.sort((a, b) => a.created.localeCompare(b.created)))
    add(r, {
      reason: "untaken",
      with: r.group_slug ? `#${r.group_slug}` : "You",
      since: r.created,
      said: "",
    });
  for (const r of back.sort((a, b) => a.at.localeCompare(b.at)))
    add(r, {
      reason: "came_back",
      with: person(r.by_name, r.by_handle, r.by_id),
      since: r.at,
      said: r.body,
    });

  return {
    rows,
    closed: closed.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary || "",
      by:
        r.agent_id && !r.agent_id.startsWith("person-")
          ? agentName(person(r.by_name, r.by_handle, r.by_id), r.host, r.by_id === account)
          : person(r.by_name, r.by_handle, r.by_id),
      at: r.updated,
      project: projectOf(r.id),
      changed: changeWords(r.changed),
    })),
  };
}

/**
 * The project each piece of work belongs to: the top project above the project it is linked into. A project
 * is a top-level project for now (docs/LOOP.md §0: today's projects become projects). Only projects
 * this account can see count, so a link into somebody's private project names nothing.
 */
async function projectsOf(
  db: D1Database,
  account: string,
  ids: string[],
): Promise<Map<string, Project>> {
  const out = new Map<string, Project>();
  if (!ids.length) return out;
  const { results: projects } = await db
    .prepare(
      `SELECT f.id, f.title, f.color, f.parent_id FROM project f
        WHERE (f.team_id = '' AND f.created_by = ?1)
           OR f.team_id IN (SELECT team_id FROM membership WHERE account_id = ?1)`,
    )
    .bind(account)
    .all<{ id: string; title: string; color: string; parent_id: string | null }>();
  const byId = new Map(projects.map((f) => [f.id, f]));
  const root = (id: string) => {
    let f = byId.get(id);
    for (let hops = 0; f?.parent_id && byId.has(f.parent_id) && hops < 64; hops++)
      f = byId.get(f.parent_id);
    return f ? { id: f.id, title: f.title, color: f.color || "" } : null;
  };
  const links: { work_id: string; project_id: string }[] = [];
  for (const slice of slices(ids))
    links.push(
      ...(
        await db
          .prepare(
            `SELECT work_id, project_id FROM project_work WHERE work_id IN (${slice.map(() => "?").join(",")})
              ORDER BY added`,
          )
          .bind(...slice)
          .all<{ work_id: string; project_id: string }>()
      ).results,
    );
  for (const l of links) {
    if (out.has(l.work_id)) continue;
    const p = root(l.project_id);
    if (p) out.set(l.work_id, p);
  }
  return out;
}

/** D1 refuses a statement with more than 100 bound values. */
const slices = (ids: string[], size = 90) =>
  Array.from({ length: Math.ceil(ids.length / size) }, (_, i) =>
    ids.slice(i * size, (i + 1) * size),
  );

/**
 * The two facts every board card shows beside its title, for a page of work: its project, and
 * what changed on it since this account last looked, worded as the register words it.
 */
export async function marksOf(
  db: D1Database,
  account: string,
  ids: string[],
): Promise<Map<string, { project: Project | null; changed: string }>> {
  const projects = await projectsOf(db, account, ids);
  const latest = new Map<string, string>();
  for (const slice of slices(ids)) {
    const { results } = await db
      .prepare(
        `SELECT work_id, kind FROM notification
          WHERE account_id = ? AND read_at = '' AND work_id IN (${slice.map(() => "?").join(",")})
          ORDER BY at`,
      )
      .bind(account, ...slice)
      .all<{ work_id: string; kind: string }>();
    // Oldest first, so the latest unread one is what is left: the same one the register names.
    for (const r of results) latest.set(r.work_id, r.kind);
  }
  return new Map(
    ids.map((id) => [
      id,
      { project: projects.get(id) ?? null, changed: changeWords(latest.get(id) ?? "") },
    ]),
  );
}
