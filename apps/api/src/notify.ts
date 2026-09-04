// The notification spine. Four moments matter, and each one is a row addressed to the account
// that should hear about it:
//
//   handoff   a guide was addressed to you by name
//   shared    a guide landed in a team you are in
//   pulled    someone pulled your guide — the transfer landed
//   consumed  the receiver marked your guide done
//   verified  someone tried it and it holds up
//   failed    someone tried it and it does not — the one people need to see today
//   joined    someone accepted your invite
//
// Rows first, delivery second. `line()` renders the one sentence every surface shows (CLI, MCP,
// hub), so the wording is decided once here rather than three times.

import type { MailEnv } from "./email.js";

export const KINDS = [
  "handoff",
  "shared",
  "pulled",
  "consumed",
  "verified",
  "failed",
  "joined",
] as const;
export type Kind = (typeof KINDS)[number];

export type NotifyEnv = MailEnv & { DB: D1Database };

export interface Event {
  /** Account being told. Ignored when it is the actor: nobody needs telling what they just did. */
  to: string;
  kind: Kind;
  guide_id?: string;
  /** Who did it. '' is an anonymous share-link reader. */
  actor_id?: string;
  team_id?: string;
  /** One line of context shown with the event. Currently a verdict's reason. */
  note?: string;
  /**
   * Optional mail for this event, run only the first time it happens. A repeat of the same event
   * coalesces into the existing row, and inboxes are the easiest thing to ruin.
   */
  mail?: () => Promise<boolean>;
}

export interface Row {
  id: number;
  kind: Kind;
  guide_id: string;
  actor_id: string;
  team_id: string;
  at: string;
  times: number;
  read_at: string;
  note: string;
  title: string;
  actor: string;
  team: string;
}

/** Record one event and, if it is new, deliver it. Never throws; callers are on the write path. */
export async function notify(env: NotifyEnv, e: Event): Promise<void> {
  if (!e.to || e.to === e.actor_id) return;
  const at = new Date().toISOString();
  try {
    const row = await env.DB.prepare(
      `INSERT INTO notification (account_id, kind, guide_id, actor_id, team_id, at, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, kind, guide_id, actor_id)
         DO UPDATE SET at = excluded.at, times = notification.times + 1, note = excluded.note
       RETURNING id, times, emailed_at`,
    )
      .bind(e.to, e.kind, e.guide_id || "", e.actor_id || "", e.team_id || "", at, e.note || "")
      .first<{ id: number; times: number; emailed_at: string }>();
    if (!row || !e.mail || row.times !== 1 || row.emailed_at) return;
    if (await e.mail()) {
      await env.DB.prepare("UPDATE notification SET emailed_at = ? WHERE id = ?")
        .bind(at, row.id)
        .run();
    }
  } catch (err) {
    // A notification is never worth failing the action that caused it.
    console.error("notify", e.kind, (err as Error).message);
  }
}

/** Tell several people about the same thing (a team-wide share). */
export async function notifyAll(env: NotifyEnv, tos: string[], e: Omit<Event, "to">) {
  for (const to of tos) await notify(env, { ...e, to });
}

const FEED_SQL = `SELECT n.id, n.kind, n.guide_id, n.actor_id, n.team_id, n.at, n.times, n.read_at, n.note,
         COALESCE(g.title, '') AS title, COALESCE(a.handle, '') AS actor, COALESCE(t.slug, '') AS team
  FROM notification n
  LEFT JOIN guide g ON g.id = n.guide_id
  LEFT JOIN account a ON a.id = n.actor_id
  LEFT JOIN team t ON t.id = n.team_id
  WHERE n.account_id = ?`;

export async function feed(
  env: NotifyEnv,
  account: string,
  { unread = false, limit = 50 } = {},
): Promise<Row[]> {
  const { results } = await env.DB.prepare(
    `${FEED_SQL}${unread ? " AND n.read_at = ''" : ""} ORDER BY n.at DESC LIMIT ?`,
  )
    .bind(account, Math.min(Math.max(limit, 1), 200))
    .all<Row>();
  return results;
}

export async function unreadCount(env: NotifyEnv, account: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM notification WHERE account_id = ? AND read_at = ''",
  )
    .bind(account)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Mark ids read, or everything unread when no ids are given. Returns how many changed. */
export async function markRead(env: NotifyEnv, account: string, ids?: number[]): Promise<number> {
  const at = new Date().toISOString();
  const stmt = ids?.length
    ? env.DB.prepare(
        `UPDATE notification SET read_at = ? WHERE account_id = ? AND read_at = ''
         AND id IN (${ids.map(() => "?").join(",")})`,
      ).bind(at, account, ...ids)
    : env.DB.prepare(
        "UPDATE notification SET read_at = ? WHERE account_id = ? AND read_at = ''",
      ).bind(at, account);
  const { meta } = await stmt.run();
  return meta.changes ?? 0;
}

/** The single sentence a notification reads as. Every surface shows this string. */
export function line(
  r: Pick<Row, "kind" | "actor" | "title" | "team" | "times"> & { note?: string },
): string {
  const who = r.actor ? `@${r.actor}` : "someone with the link";
  const title = r.title ? `"${r.title}"` : "a guide";
  const more = r.times > 1 ? ` (${r.times}×)` : "";
  const note = r.note ? `: ${r.note}` : "";
  switch (r.kind) {
    case "handoff":
      return `${who} handed you ${title}${r.team ? ` in ${r.team}` : ""}`;
    case "shared":
      return `${who} shared ${title} with ${r.team || "your team"}`;
    case "pulled":
      return `${who} pulled ${title}${more}`;
    case "consumed":
      return `${who} marked ${title} consumed`;
    case "verified":
      return `${who} verified ${title}${note}`;
    case "failed":
      return `${who} says ${title} does not work${note}`;
    case "joined":
      return `${who} joined ${r.team || "your team"}`;
    default:
      return `${who} did something to ${title}`;
  }
}

export const summary = (r: Row) => ({
  id: r.id,
  kind: r.kind,
  guide: r.guide_id,
  actor: r.actor,
  team: r.team,
  title: r.title,
  at: r.at,
  times: r.times,
  note: r.note,
  read: Boolean(r.read_at),
  text: line(r),
});
