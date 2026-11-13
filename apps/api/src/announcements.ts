// Product news by email (migrations/0075_announcements.sql): one mail, written in /admin and sent
// to every account that can be reached and has not said no.
//
// Who gets it is decided here and nowhere else: an address on the account, proven to reach its
// owner (`email_verified`, which 0050 backfilled for every account older than verification), and
// no `news_mail_off`. Work mail does not depend on any of this; saying no to news stops news.
//
// Sending is in batches the hub asks for one after another, because a Worker request has a ceiling
// on what it may call and a deployment's account list does not. Each recipient is claimed with a
// row before their mail goes, so a batch that overlaps another (two tabs, a double click) skips
// whoever the other has already taken, and a send that stops halfway carries on where it was.
//
// This file imports nothing, so a test can run it against SQLite with every migration applied.
// Ids, tokens and hashes come in from the caller for the same reason.

type Db = D1Database;

export const SUBJECT_MAX = 150;
export const BODY_MAX = 20_000;
/** People per batch. Each costs a few database calls and one send, well under a request's limit. */
export const BATCH = 40;

/**
 * Who is sent product news. Kept as one fragment so the count and the send cannot disagree.
 * Never a suspended account (0085_suspension.sql): news to someone shut out reads as a mistake.
 * A deleted one (0086) has no email left, and is named anyway so that never has to stay true.
 */
const REACHABLE =
  "a.email <> '' AND a.email_verified <> '' AND a.news_mail_off = '' AND a.suspended_at = '' AND a.deleted_at = ''";

export interface Announcement {
  id: string;
  subject: string;
  body: string;
  created: string;
  created_by: string;
  started: string;
  started_by: string;
}

/** A refusal said to the person who asked, with the status it goes out under. */
export type Refusal = { error: string; status: 400 | 404 | 409 };

/** The two fields, trimmed and checked. */
export function draft(o: {
  subject?: unknown;
  body?: unknown;
}): { subject: string; body: string } | Refusal {
  const subject = String(o.subject ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const body = String(o.body ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!subject) return { error: "Give it a subject line.", status: 400 };
  if (subject.length > SUBJECT_MAX)
    return { error: `Keep the subject under ${SUBJECT_MAX} characters.`, status: 400 };
  if (!body) return { error: "Write what you want to tell people.", status: 400 };
  if (body.length > BODY_MAX)
    return { error: `Keep it under ${BODY_MAX.toLocaleString("en")} characters.`, status: 400 };
  return { subject, body };
}

/** How many accounts a send would reach right now. */
export async function audience(db: Db): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM account a WHERE ${REACHABLE}`)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/** Every announcement, newest first, with how far its send got. */
export async function announcements(
  db: Db,
): Promise<(Announcement & { sent: number; failed: number })[]> {
  const { results } = await db
    .prepare(
      `SELECT n.*,
              (SELECT COUNT(*) FROM announcement_sent s WHERE s.announcement_id = n.id AND s.ok = 1) AS sent,
              (SELECT COUNT(*) FROM announcement_sent s WHERE s.announcement_id = n.id AND s.ok = 0) AS failed
         FROM announcement n
        ORDER BY n.created DESC`,
    )
    .all<Announcement & { sent: number; failed: number }>();
  return results.map((r) => ({ ...r, sent: Number(r.sent), failed: Number(r.failed) }));
}

export async function announcement(db: Db, id: string): Promise<Announcement | null> {
  return db.prepare("SELECT * FROM announcement WHERE id = ?").bind(id).first<Announcement>();
}

export async function createAnnouncement(
  db: Db,
  o: { id: string; subject: string; body: string; by: string; at: string },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO announcement (id, subject, body, created, created_by) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(o.id, o.subject, o.body, o.at, o.by)
    .run();
}

const ALREADY_SENT: Refusal = {
  error: "This one has already gone out, so it can't be changed. Write a new one instead.",
  status: 409,
};

/** Change a draft. Refused once anyone has been sent it: what people were told stays on record. */
export async function updateAnnouncement(
  db: Db,
  id: string,
  o: { subject: string; body: string },
): Promise<{ ok: true } | Refusal> {
  const r = await db
    .prepare("UPDATE announcement SET subject = ?, body = ? WHERE id = ? AND started = ''")
    .bind(o.subject, o.body, id)
    .run();
  if (r.meta.changes) return { ok: true };
  return (await announcement(db, id))
    ? ALREADY_SENT
    : { error: "There's no announcement with that id. It may have been deleted.", status: 404 };
}

export async function deleteAnnouncement(db: Db, id: string): Promise<{ ok: true } | Refusal> {
  const r = await db
    .prepare("DELETE FROM announcement WHERE id = ? AND started = ''")
    .bind(id)
    .run();
  if (r.meta.changes) return { ok: true };
  return (await announcement(db, id))
    ? ALREADY_SENT
    : { error: "There's no announcement with that id. It may have been deleted.", status: 404 };
}

/** Mark the send begun, once: the first real batch is what freezes the text. */
export async function startSending(db: Db, id: string, by: string, at: string): Promise<void> {
  await db
    .prepare("UPDATE announcement SET started = ?, started_by = ? WHERE id = ? AND started = ''")
    .bind(at, by, id)
    .run();
}

/** Who is next: reachable now, and not yet sent this one. */
export async function nextRecipients(
  db: Db,
  id: string,
  limit = BATCH,
): Promise<{ id: string; email: string; name: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT a.id, a.email, a.name FROM account a
        WHERE ${REACHABLE}
          AND NOT EXISTS (SELECT 1 FROM announcement_sent s WHERE s.announcement_id = ? AND s.account_id = a.id)
        ORDER BY a.created, a.id
        LIMIT ?`,
    )
    .bind(id, limit)
    .all<{ id: string; email: string; name: string }>();
  return results;
}

/** How many reachable accounts have not been sent this one yet. */
export async function left(db: Db, id: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM account a
        WHERE ${REACHABLE}
          AND NOT EXISTS (SELECT 1 FROM announcement_sent s WHERE s.announcement_id = ? AND s.account_id = a.id)`,
    )
    .bind(id)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/** Take one recipient for this send. False when another send already has them. */
export async function claim(db: Db, id: string, account: string, at: string): Promise<boolean> {
  const r = await db
    .prepare(
      "INSERT OR IGNORE INTO announcement_sent (announcement_id, account_id, sent) VALUES (?, ?, ?)",
    )
    .bind(id, account, at)
    .run();
  return r.meta.changes > 0;
}

export async function markSent(db: Db, id: string, account: string, ok: boolean): Promise<void> {
  await db
    .prepare("UPDATE announcement_sent SET ok = ? WHERE announcement_id = ? AND account_id = ?")
    .bind(ok ? 1 : 0, id, account)
    .run();
}

/** Keep a stop link's hash for `account`. The token itself goes only into the mail. */
export async function keepOffLink(db: Db, hash: string, account: string, at: string) {
  await db
    .prepare("INSERT INTO news_off_link (hash, account_id, created) VALUES (?, ?, ?)")
    .bind(hash, account, at)
    .run();
}

/**
 * Stop product news for whoever a link was sent to. Saying it twice is not an error: a mail
 * provider's one-click request and the person's own click can both arrive, and both are told yes.
 */
export async function turnOffByLink(db: Db, hash: string, at: string): Promise<boolean> {
  const link = await db
    .prepare("SELECT account_id FROM news_off_link WHERE hash = ?")
    .bind(hash)
    .first<{ account_id: string }>();
  if (!link) return false;
  await setNewsMail(db, link.account_id, false, at);
  return true;
}

/** On or off from Settings. Turning it off keeps the first time it was said. */
export async function setNewsMail(db: Db, account: string, on: boolean, at: string) {
  await db
    .prepare(
      on
        ? "UPDATE account SET news_mail_off = '' WHERE id = ?"
        : "UPDATE account SET news_mail_off = ? WHERE id = ? AND news_mail_off = ''",
    )
    .bind(...(on ? [account] : [at, account]))
    .run();
}

// ---- campaigns: the owner's admin hub (admin-hub CONTRACT.md, "Campaigns") ----------------------
//
// A campaign is an announcement written and sent from the hub in one step. What differs from
// /admin is who drives the batches: the hub asks once and leaves, so every reachable account is
// queued when it asks (0087_announcement_queue.sql) and the once-a-minute cron sends from the queue
// (`queued()`), with the same claim per recipient as /admin, so the two never reach anyone twice.

/** The 20 the hub lists. */
const CAMPAIGNS = 20;

export interface Campaign {
  id: string;
  subject: string;
  status: "sending" | "done";
  recipients: number;
  sent: number;
  failed: number;
  created_at: string;
  by: string;
}

/** Who a campaign reaches now, and why everyone else is left out, each counted once. */
export async function campaignAudience(db: Db) {
  const row = await db
    .prepare(
      `SELECT SUM(a.suspended_at <> '') AS suspended,
              SUM(a.suspended_at = '' AND a.news_mail_off <> '') AS no_consent,
              -- No address at all is unproven too: there is nothing to have proven.
              SUM(a.suspended_at = '' AND a.news_mail_off = '' AND (a.email = '' OR a.email_verified = '')) AS unverified
         FROM account a WHERE a.deleted_at = ''`,
    )
    .first<{ suspended: number | null; no_consent: number | null; unverified: number | null }>();
  return {
    reachable: await audience(db),
    excluded: {
      no_consent: Number(row?.no_consent ?? 0),
      unverified: Number(row?.unverified ?? 0),
      suspended: Number(row?.suspended ?? 0),
    },
  };
}

/** The hub's `{ subject, markdown }` through the same checks /admin's form goes through. */
export const campaignDraft = (o: Record<string, unknown>) =>
  draft({ subject: o.subject, body: o.markdown });

const CAMPAIGN_SQL = `SELECT n.id, n.subject, n.created AS created_at,
       -- An /admin send records the operator's account; a hub send records the operator's email.
       COALESCE((SELECT o.email FROM account o WHERE o.id = n.started_by AND o.email <> ''), n.started_by) AS by,
       (SELECT COUNT(*) FROM announcement_sent s WHERE s.announcement_id = n.id AND s.ok = 1) AS sent,
       (SELECT COUNT(*) FROM announcement_sent s WHERE s.announcement_id = n.id AND s.ok = 0) AS failed,
       (SELECT COUNT(*) FROM announcement_queue q WHERE q.announcement_id = n.id) AS queued
  FROM announcement n WHERE n.started <> ''`;

type CampaignRow = Omit<Campaign, "status" | "recipients"> & { queued: number };

const asCampaign = (r: CampaignRow): Campaign => {
  const sent = Number(r.sent);
  const failed = Number(r.failed);
  const queued = Number(r.queued);
  return {
    id: r.id,
    subject: r.subject,
    status: queued ? "sending" : "done",
    // Everyone tried plus everyone still queued. Someone who says no before their turn leaves it.
    recipients: sent + failed + queued,
    sent,
    failed,
    created_at: r.created_at,
    by: r.by,
  };
};

/** Every announcement that has started sending, newest first: a draft in /admin is no campaign. */
export async function campaigns(db: Db): Promise<Campaign[]> {
  const { results } = await db
    .prepare(`${CAMPAIGN_SQL} ORDER BY n.started DESC, n.id LIMIT ?`)
    .bind(CAMPAIGNS)
    .all<CampaignRow>();
  return results.map(asCampaign);
}

export async function campaign(db: Db, id: string): Promise<Campaign | null> {
  const r = await db.prepare(`${CAMPAIGN_SQL} AND n.id = ?`).bind(id).first<CampaignRow>();
  return r ? asCampaign(r) : null;
}

/**
 * Record a campaign and queue everyone it reaches, if the audience is still the number the
 * operator confirmed. `by` is the operator's email: `created_by` and `started_by` name no account
 * (no foreign key), and the hub's operator may have none here.
 */
export async function sendCampaign(
  db: Db,
  input: Record<string, unknown>,
  o: { id: string; by: string; at: string },
): Promise<{ ok: true; campaign: Campaign } | Refusal> {
  const d = campaignDraft(input);
  if ("error" in d) return d;
  if (!Number.isInteger(input.expected))
    return { error: "Say how many people you expect it to reach (expected).", status: 400 };
  const now = await audience(db);
  if (now !== input.expected)
    return { error: `The audience is now ${now}, not ${input.expected}.`, status: 409 };
  await db
    .prepare(
      "INSERT INTO announcement (id, subject, body, created, created_by, started, started_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(o.id, d.subject, d.body, o.at, o.by, o.at, o.by)
    .run();
  await db
    .prepare(
      `INSERT INTO announcement_queue (announcement_id, account_id)
       SELECT ?, a.id FROM account a WHERE ${REACHABLE}`,
    )
    .bind(o.id)
    .run();
  return { ok: true, campaign: (await campaign(db, o.id)) as Campaign };
}

/**
 * The next people the cron should mail, oldest campaign first. Anyone queued who is no longer
 * reachable is dropped first, so saying no between the send and their turn still holds.
 */
export async function queued(
  db: Db,
  limit = BATCH,
): Promise<{ announcement: string; id: string; email: string; name: string }[]> {
  await db
    .prepare(
      `DELETE FROM announcement_queue WHERE NOT EXISTS
         (SELECT 1 FROM account a WHERE a.id = announcement_queue.account_id AND ${REACHABLE})`,
    )
    .run();
  const { results } = await db
    .prepare(
      `SELECT q.announcement_id AS announcement, a.id, a.email, a.name
         FROM announcement_queue q JOIN account a ON a.id = q.account_id
         JOIN announcement n ON n.id = q.announcement_id
        ORDER BY n.started, a.created, a.id
        LIMIT ?`,
    )
    .bind(limit)
    .all<{ announcement: string; id: string; email: string; name: string }>();
  return results;
}

/** Done with one queued person, whether this send reached them or another already had. */
export async function dequeue(db: Db, id: string, account: string): Promise<void> {
  await db
    .prepare("DELETE FROM announcement_queue WHERE announcement_id = ? AND account_id = ?")
    .bind(id, account)
    .run();
}
