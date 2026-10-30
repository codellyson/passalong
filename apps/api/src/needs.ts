// What waits on one person, ranked: the hub's first screen (`GET /v1/needs`).
//
// One read rather than five on the client, because the ranking is a statement about the product —
// a customer waiting outranks an agent's question, which outranks work nobody took — and a rule
// like that belongs in one place. Each piece of work appears once, under the most pressing reason
// it has. It owns no table: every row is derived from guide, claim, task_event and notification,
// so it cannot disagree with the board.
//
// Imports no sibling, so test/needs.test.mjs can run it against real SQLite with every migration.

/** Why a row is waiting on you, most pressing first. The order is the rank. */
export const REASONS = ["customer", "asking", "stuck", "untaken", "came_back"] as const;
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
  /** Who the work is with: the customer, the agent or person holding it, who passed it back. */
  with: string;
  /** Since when it has waited on you. Age is measured from here. */
  since: string;
  /** The question asked, or the reason it came back, when there is one. */
  said: string;
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

export interface Customer {
  id: string;
  title: string;
  customer: string;
  /** True while the next word is ours. */
  ours: boolean;
  since: string;
  project: Project | null;
  changed: string;
}

/** Readable by this account: its own, or its teams'. Binds ?1. */
const VISIBLE = `(g.account_id = ?1 OR (g.team_id <> '' AND g.team_id IN
  (SELECT team_id FROM membership WHERE account_id = ?1)))`;

/** The latest unread notification on the guide for ?1: what makes a row "changed". */
const CHANGED = `COALESCE((SELECT n.kind FROM notification n
  WHERE n.account_id = ?1 AND n.guide_id = g.id AND n.read_at = ''
  ORDER BY n.at DESC LIMIT 1), '')`;

/**
 * A few words for the change mark, one per notification kind, so the mark always names what
 * changed. A kind added to notify.ts later and not here still marks the row, as "Changed".
 */
const CHANGE_WORDS: Record<string, string> = {
  handoff: "Sent to you",
  shared: "Shared",
  declined: "Passed back",
  pulled: "Opened",
  consumed: "Archived",
  reopened: "Reopened",
  joined: "Someone joined",
  promoted: "Promoted",
  removed: "Removed",
  task_claimed: "Taken",
  task_finished: "Finished",
  task_released: "Let go",
  sent_back: "Reopened",
  reassigned: "Given to you",
  stalled: "Went quiet",
  shelved: "Moved to Draft",
  still_draft: "Still a draft",
  requeued: "Back in the queue",
  stuck: "Stuck",
  untaken: "Nobody took it",
  customer_wrote: "Customer wrote",
  reader_unsure: "Needs a look",
  customer_waiting: "Customer waiting",
  child_done: "Follow-up finished",
  asked: "New question",
  replied: "New reply",
  blocked: "Blocked",
  signed_up: "Signed up",
  billed_twice: "Billed twice",
  emailed: "Came in by email",
  email_sender: "New sender",
  hooked: "Came in from an alert",
};
export const changeWords = (kind: string) => (kind ? CHANGE_WORDS[kind] || "Changed" : "");

/** A customer's message on one line, cut at a word past 160 characters. */
const words = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= 160) return flat;
  const cut = flat.slice(0, 160);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 100 ? cut.lastIndexOf(" ") : 160)}…`;
};

const person = (name: string, handle: string, id: string) =>
  name.trim() || (handle ? `@${handle}` : id ? `@${id}` : "");

/** Closed work stays in the column this long. */
export const CLOSED_DAYS = 7;

export async function needs(
  db: D1Database,
  account: string,
  at: string,
): Promise<{ rows: NeedRow[]; customers: Customer[]; closed: Closed[] }> {
  const q = <T>(sql: string, ...binds: string[]) =>
    db
      .prepare(sql)
      .bind(...binds)
      .all<T>()
      .then((r) => r.results);

  type Base = { id: string; title: string; summary: string; changed: string };
  const [customers, held, untaken, back, closed] = await Promise.all([
    // Open customer requests. Ours to answer when nothing was answered since they last wrote.
    q<
      Base & {
        customer: string;
        customer_name: string;
        wrote: string;
        answered: string;
        words: string;
      }
    >(
      `SELECT g.id, g.title, g.summary, g.customer, g.customer_name, ${CHANGED} AS changed,
              COALESCE((SELECT MAX(at) FROM task_event e WHERE e.guide_id = g.id AND e.kind = 'customer'), g.created) AS wrote,
              COALESCE((SELECT MAX(at) FROM task_event e WHERE e.guide_id = g.id AND e.kind = 'answered'), '') AS answered,
              COALESCE((SELECT e.body FROM task_event e WHERE e.guide_id = g.id AND e.kind = 'customer'
                         ORDER BY e.at DESC, e.id DESC LIMIT 1), '') AS words
         FROM guide g
        WHERE g.customer <> '' AND g.status = 'published' AND ${VISIBLE}`,
      account,
    ),
    // Held work an agent is asking about, or that went quiet: the holder's own account and the
    // author are the people it waits on.
    q<
      Base & {
        lease_until: string;
        asking: string;
        asked_at: string;
        by_name: string;
        by_handle: string;
        agent_id: string;
        holder: string;
      }
    >(
      `SELECT g.id, g.title, g.summary, ${CHANGED} AS changed, c.lease_until, c.agent_id,
              c.account_id AS holder, COALESCE(a.name, '') AS by_name, COALESCE(a.handle, '') AS by_handle,
              COALESCE(e.body, '') AS asking, COALESCE(e.at, '') AS asked_at
         FROM claim c JOIN guide g ON g.id = c.guide_id
         LEFT JOIN account a ON a.id = c.account_id
         LEFT JOIN task_event e ON e.id = (SELECT x.id FROM task_event x
            WHERE x.guide_id = c.guide_id AND x.kind = 'asked' AND x.at >= c.claimed_at
              AND NOT EXISTS (SELECT 1 FROM task_event r WHERE r.guide_id = x.guide_id
                               AND r.kind = 'replied' AND r.id > x.id)
            ORDER BY x.id DESC LIMIT 1)
        WHERE c.state = 'claimed' AND g.status <> 'consumed'
          AND (c.account_id = ?1 OR g.account_id = ?1)
          AND (e.id IS NOT NULL OR c.lease_until <= ?2)`,
      account,
      at,
    ),
    // Sent to you, or to a group you are in, that nobody has taken.
    q<Base & { created: string; group_slug: string }>(
      `SELECT g.id, g.title, g.summary, ${CHANGED} AS changed, g.created,
              COALESCE(tg.slug, '') AS group_slug
         FROM guide g LEFT JOIN team_group tg ON tg.id = g.to_group_id AND g.to_group_id <> ''
        WHERE g.status = 'published' AND g.customer = ''
          AND (g.to_account_id = ?1 OR (g.to_group_id <> '' AND g.to_group_id IN
                 (SELECT group_id FROM group_member WHERE account_id = ?1)))
          AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.guide_id = g.id)`,
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
         FROM guide g
         JOIN task_event e ON e.id = (SELECT MAX(x.id) FROM task_event x WHERE x.guide_id = g.id
                                        AND x.kind NOT IN ('progress', 'noted', 'customer', 'answered'))
         LEFT JOIN account a ON a.id = e.account_id
        WHERE g.account_id = ?1 AND g.status = 'published'
          AND e.kind IN ('passed', 'reopened') AND e.account_id <> ?1
          AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.guide_id = g.id)`,
      account,
    ),
    // Finished lately, by whoever handed it in.
    q<
      Base & {
        updated: string;
        agent_id: string;
        by_name: string;
        by_handle: string;
        by_id: string;
      }
    >(
      `SELECT g.id, g.title, g.summary, ${CHANGED} AS changed, g.updated,
              COALESCE(e.agent_id, '') AS agent_id, COALESCE(e.account_id, '') AS by_id,
              COALESCE(a.name, '') AS by_name, COALESCE(a.handle, '') AS by_handle
         FROM guide g
         LEFT JOIN task_event e ON e.id = (SELECT MAX(x.id) FROM task_event x
                                             WHERE x.guide_id = g.id AND x.kind = 'handed_in')
         LEFT JOIN account a ON a.id = e.account_id
        WHERE g.status = 'consumed' AND g.outcome = 'finished' AND ${VISIBLE}
          AND g.updated >= strftime('%Y-%m-%dT%H:%M:%fZ', ?2, '-${CLOSED_DAYS} days')
        ORDER BY g.updated DESC LIMIT 8`,
      account,
      at,
    ),
  ]);

  const projects = await projectsOf(db, account, [
    ...new Set([...customers, ...held, ...untaken, ...back, ...closed].map((r) => r.id)),
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

  const waiting = customers
    .filter((r) => !r.answered || r.answered < r.wrote)
    .sort((a, b) => a.wrote.localeCompare(b.wrote));
  for (const r of waiting)
    add(r, {
      reason: "customer",
      with: r.customer_name || r.customer,
      since: r.wrote,
      // Their own latest words, not the title said again.
      said: words(r.words),
    });
  const holder = (r: (typeof held)[number]) =>
    r.agent_id.startsWith("person-") ? person(r.by_name, r.by_handle, r.holder) : r.agent_id;
  for (const r of held.filter((h) => h.asking).sort((a, b) => a.asked_at.localeCompare(b.asked_at)))
    add(r, { reason: "asking", with: holder(r), since: r.asked_at, said: r.asking });
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
    // Only the requests waiting on the customer: the ones waiting on us are rows already.
    customers: customers
      .filter((r) => r.answered && r.answered >= r.wrote)
      .map((r) => ({
        id: r.id,
        title: r.title,
        customer: r.customer_name || r.customer,
        ours: false,
        since: r.answered,
        project: projectOf(r.id),
        changed: changeWords(r.changed),
      }))
      .sort((a, b) => a.since.localeCompare(b.since))
      .slice(0, 8),
    closed: closed.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary || "",
      by:
        r.agent_id && !r.agent_id.startsWith("person-")
          ? r.agent_id
          : person(r.by_name, r.by_handle, r.by_id),
      at: r.updated,
      project: projectOf(r.id),
      changed: changeWords(r.changed),
    })),
  };
}

/**
 * The project each guide belongs to: the top folder above the folder it is linked into. A project
 * is a top-level folder for now (docs/LOOP.md §0: today's folders become projects). Only folders
 * this account can see count, so a link into somebody's private folder names nothing.
 */
async function projectsOf(
  db: D1Database,
  account: string,
  ids: string[],
): Promise<Map<string, Project>> {
  const out = new Map<string, Project>();
  if (!ids.length) return out;
  const { results: folders } = await db
    .prepare(
      `SELECT f.id, f.title, f.color, f.parent_id FROM folder f
        WHERE (f.team_id = '' AND f.created_by = ?1)
           OR f.team_id IN (SELECT team_id FROM membership WHERE account_id = ?1)`,
    )
    .bind(account)
    .all<{ id: string; title: string; color: string; parent_id: string | null }>();
  const byId = new Map(folders.map((f) => [f.id, f]));
  const root = (id: string) => {
    let f = byId.get(id);
    for (let hops = 0; f?.parent_id && byId.has(f.parent_id) && hops < 64; hops++)
      f = byId.get(f.parent_id);
    return f ? { id: f.id, title: f.title, color: f.color || "" } : null;
  };
  const links: { guide_id: string; folder_id: string }[] = [];
  for (const slice of slices(ids))
    links.push(
      ...(
        await db
          .prepare(
            `SELECT guide_id, folder_id FROM folder_guide WHERE guide_id IN (${slice.map(() => "?").join(",")})
              ORDER BY added`,
          )
          .bind(...slice)
          .all<{ guide_id: string; folder_id: string }>()
      ).results,
    );
  for (const l of links) {
    if (out.has(l.guide_id)) continue;
    const p = root(l.folder_id);
    if (p) out.set(l.guide_id, p);
  }
  return out;
}

/** D1 refuses a statement with more than 100 bound values. */
const slices = (ids: string[], size = 90) =>
  Array.from({ length: Math.ceil(ids.length / size) }, (_, i) =>
    ids.slice(i * size, (i + 1) * size),
  );

/**
 * The two facts every board card shows beside its title, for a page of guides: its project, and
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
        `SELECT guide_id, kind FROM notification
          WHERE account_id = ? AND read_at = '' AND guide_id IN (${slice.map(() => "?").join(",")})
          ORDER BY at`,
      )
      .bind(account, ...slice)
      .all<{ guide_id: string; kind: string }>();
    // Oldest first, so the latest unread one is what is left: the same one the register names.
    for (const r of results) latest.set(r.guide_id, r.kind);
  }
  return new Map(
    ids.map((id) => [
      id,
      { project: projects.get(id) ?? null, changed: changeWords(latest.get(id) ?? "") },
    ]),
  );
}

// ---- the Support list ---------------------------------------------------------------------------

export type SupportState = "new" | "needs_reply" | "with_development" | "waiting" | "solved";

/**
 * Where a customer's request stands, from what already happened (docs/LOOP.md §1a): never stored,
 * so it cannot disagree with the request. Solved is Done. Nothing said to them yet is new, and a
 * customer who wrote after our last answer needs a reply, whatever else is going on: a fix being
 * open never hides a customer nobody has answered. Only once our word is last does open work made
 * from it mean it is with development; otherwise we wait on them.
 */
export function supportState(r: {
  done: boolean;
  lastBy: "customer" | "team" | "";
  answered: boolean;
  openWork: number;
}): SupportState {
  if (r.done) return "solved";
  if (!r.answered) return "new";
  if (r.lastBy !== "team") return "needs_reply";
  return r.openWork > 0 ? "with_development" : "waiting";
}

export interface SupportRequest {
  id: string;
  title: string;
  ref: string;
  customer: { name: string; email: string };
  state: SupportState;
  /** Since when the customer has waited on us; '' when the next word is theirs or it is solved. */
  waiting_since: string;
  /** Waited on us longer than the reminder allows (`customer_waiting`). */
  late: boolean;
  /** The customer's own latest words, on one line. */
  said: string;
  last: { by: "customer" | "team" | ""; line: string; at: string };
  updated: string;
  /** Whether the request's team asked to be reminded to tell the customer a fix is done. */
  tell: boolean;
  project: Project | null;
  /** What changed since you last looked, in a few words; '' when nothing unread is on it. */
  changed: string;
}

/**
 * Every customer request this account can see, for the Support list: who, what, where it stands,
 * since when the customer has waited, its project and what changed — one read, so the page needs
 * no call per row. Also the teams whose owner (this account) may set the tell-the-customer reminder.
 */
export async function supportRequests(
  db: D1Database,
  account: string,
  at: string,
  waitMs: number,
): Promise<{ requests: SupportRequest[]; teams: { slug: string; name: string; tell: boolean }[] }> {
  const LAST = (col: string, kinds = "'customer', 'answered'") =>
    `(SELECT ${col} FROM task_event WHERE guide_id = g.id AND kind IN (${kinds}) ORDER BY at DESC, id DESC LIMIT 1)`;
  const { results } = await db
    .prepare(
      `SELECT g.id, g.title, g.ref, g.customer, g.customer_name, g.status, g.created, g.updated,
              (SELECT MAX(at) FROM task_event WHERE guide_id = g.id AND kind = 'answered') AS answered_at,
              ${LAST("kind")} AS last_kind, ${LAST("body")} AS last_body, ${LAST("at")} AS last_at,
              ${LAST("body", "'customer'")} AS said,
              (SELECT COUNT(*) FROM guide k WHERE k.parent_id = g.id
                AND k.status NOT IN ('consumed', 'draft')) AS open_work,
              COALESCE(t.tell_customer, 0) AS tell
         FROM guide g LEFT JOIN team t ON t.id = g.team_id
        WHERE g.customer <> '' AND ${VISIBLE}
        ORDER BY g.updated DESC
        LIMIT 500`,
    )
    .bind(account)
    .all<{
      id: string;
      title: string;
      ref: string;
      customer: string;
      customer_name: string;
      status: string;
      created: string;
      updated: string;
      answered_at: string | null;
      last_kind: string | null;
      last_body: string | null;
      last_at: string | null;
      said: string | null;
      open_work: number;
      tell: number;
    }>();
  const { results: teams } = await db
    .prepare(
      `SELECT t.slug, t.name, t.tell_customer AS tell FROM team t
         JOIN membership m ON m.team_id = t.id AND m.account_id = ? AND m.role = 'owner'
        ORDER BY t.name`,
    )
    .bind(account)
    .all<{ slug: string; name: string; tell: number }>();
  const marks = await marksOf(
    db,
    account,
    results.map((r) => r.id),
  );
  const nowMs = Date.parse(at);
  return {
    teams: teams.map((t) => ({ slug: t.slug, name: t.name, tell: Boolean(t.tell) })),
    requests: results.map((r) => {
      const lastBy =
        r.last_kind === "customer" ? "customer" : r.last_kind === "answered" ? "team" : "";
      const state = supportState({
        done: r.status === "consumed",
        lastBy,
        answered: Boolean(r.answered_at),
        openWork: Number(r.open_work),
      });
      // Only while the next word is ours.
      const since = state === "new" || state === "needs_reply" ? r.last_at || r.created : "";
      const mark = marks.get(r.id);
      return {
        id: r.id,
        title: r.title,
        ref: r.ref,
        customer: { name: r.customer_name, email: r.customer },
        state,
        waiting_since: since,
        late: Boolean(since) && nowMs - Date.parse(since) > waitMs,
        said: words(r.said || ""),
        last: { by: lastBy, line: words(r.last_body || ""), at: r.last_at || r.created },
        updated: r.updated,
        tell: Boolean(r.tell),
        project: mark?.project ?? null,
        changed: mark?.changed ?? "",
      };
    }),
  };
}
