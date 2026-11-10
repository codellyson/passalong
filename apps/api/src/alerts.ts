/**
 * Alerts for whoever runs Passalong: every account with `role = 'super'`, and the platform owner
 * named in `ADMIN_ACCOUNTS` (see isAdmin in gifts.ts).
 *
 * An alert is an ordinary notification row, so it lands in each admin's feed like everything else,
 * and on its first occurrence it is also mailed. Adding one takes four lines:
 *
 *   1. a kind in KINDS in notify.ts,
 *   2. its sentence in line() there,
 *   3. its name in ADMIN_ALERTS below,
 *   4. a call to alertAdmins() where the thing happens.
 *
 * Never throws: an alert must not fail the signup, payment or whatever else caused it.
 */
import { markMailed, UNTAKEN_MAIL_LISTED, untakenToMail } from "./claims.js";
import { button, esc, link, p, shell } from "./mail-html.js";
import { type MailEnv, sendMail } from "./mail-send.js";
import { type Event, type Kind, type LineFacts, line, type NotifyEnv, notify } from "./notify.js";

/** The kinds that go to admins, each with the mail subject that announces it. */
export const ADMIN_ALERTS: Partial<Record<Kind, string>> = {
  signed_up: "New Passalong sign-up",
  billed_twice: "Someone is being charged twice",
  half_set: "Passalong's settings are half set",
};

type AlertEnv = NotifyEnv & MailEnv & { ADMIN_ACCOUNTS?: string };

export async function alertAdmins(env: AlertEnv, e: Omit<Event, "to" | "mail">): Promise<void> {
  const subject = ADMIN_ALERTS[e.kind];
  if (!subject) return;
  try {
    const owners = String(env.ADMIN_ACCOUNTS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const { results } = await env.DB.prepare(
      `SELECT id FROM account
       WHERE role = 'super' OR id IN (SELECT value FROM json_each(?))`,
    )
      .bind(JSON.stringify(owners))
      .all<{ id: string }>();
    await alertPeople(
      env,
      results.map((r) => r.id),
      e,
      subject,
    );
  } catch (err) {
    console.error("alert", e.kind, (err as Error).message);
  }
}

/**
 * The same notice for named accounts: a feed row each, mailed the first time. For what a person has
 * to act on or it is left behind — work that keeps going quiet, work nobody took — where the feed
 * alone is a place it can sit unread. The mail opens the work when there is one, the admin page
 * when there is not. Never throws.
 */
export async function alertPeople(
  env: AlertEnv,
  to: string[],
  e: Omit<Event, "to" | "mail">,
  subject: string,
  title = "",
  /**
   * `everyTime` mails on every call, not only a notice's first: for a moment that can come round
   * again — reaching the free limit after making room, a plan ending a week out and then tomorrow —
   * where the caller already makes sure it is said once per moment. `link` replaces where the mail
   * opens, and `more` is one sentence of what to do, under the notice.
   */
  opts: { everyTime?: boolean; link?: { url: string; label: string }; more?: string } = {},
): Promise<void> {
  try {
    const ids = [...new Set(to.filter(Boolean))];
    if (!ids.length) return;
    const { results } = await env.DB.prepare(
      "SELECT id, email FROM account WHERE id IN (SELECT value FROM json_each(?))",
    )
      .bind(JSON.stringify(ids))
      .all<{ id: string; email: string }>();
    const who = e.actor_id
      ? await env.DB.prepare("SELECT handle, name FROM account WHERE id = ?")
          .bind(e.actor_id)
          .first<{ handle: string; name: string }>()
      : null;
    // The same sentence the feed shows, so the mail and the hub never say it two ways.
    const facts: LineFacts = {
      kind: e.kind,
      title,
      times: 1,
      note: e.note || "",
      actor_id: e.actor_id || "",
      actor: who?.handle || "",
      actor_real: who?.name || "",
    };
    const text = line(facts);
    const origin = (env.PUBLIC_ORIGIN || "https://passalong.dev").replace(/\/$/, "");
    const url = opts.link?.url || (e.work_id ? `${origin}/hub/w/${e.work_id}` : `${origin}/admin`);
    const label = opts.link?.label || (e.work_id ? "Open it" : "Open the admin page");
    // Per person: the sentence is rendered from their own facts, so an owner told about a teammate
    // and the teammate told about themselves each read their own version of it.
    const send = (email: string) => () =>
      sendMail(
        env,
        email,
        subject,
        [text, ...(opts.more ? ["", opts.more] : []), "", `  ${url}`],
        shell({
          origin: env.PUBLIC_ORIGIN,
          preview: text,
          heading: subject,
          body: [p(esc(text)), ...(opts.more ? [p(esc(opts.more))] : []), button(label, url)],
        }),
      );
    for (const person of results) {
      if (opts.everyTime) {
        await notify(env, { ...e, to: person.id });
        if (person.email) await send(person.email)();
      } else
        await notify(env, {
          ...e,
          to: person.id,
          mail: person.email ? send(person.email) : undefined,
        });
    }
  } catch (err) {
    console.error("alert", e.kind, (err as Error).message);
  }
}

/** The subject of the morning mail about work nobody took: the same words as one notice, counted. */
export const untakenSubject = (n: number) =>
  n === 1 ? "Nobody has taken this" : `Nobody has taken ${n} pieces of work`;

/**
 * The morning mail about work nobody took: one per person, every piece they have not been mailed
 * about, by name (see UNTAKEN_MAIL_HOUR in claims.ts for why it is one). Each notice is marked mailed
 * only once its mail is sent, so a failed send is tried again the next morning. Returns how many
 * people were mailed. Never throws.
 */
export async function mailUntaken(env: AlertEnv, at = new Date().toISOString()): Promise<number> {
  let mailed = 0;
  try {
    const db = env.DB;
    const origin = (env.PUBLIC_ORIGIN || "https://passalong.dev").replace(/\/$/, "");
    for (const person of await untakenToMail(db)) {
      const n = person.work.length;
      const listed = person.work.slice(0, UNTAKEN_MAIL_LISTED);
      const more = n - listed.length;
      const subject = untakenSubject(n);
      const intro =
        n === 1
          ? "This was sent to someone at least three days ago and nothing has happened to it since. Give it to someone, take it, or archive it."
          : "Each of these was sent to someone at least three days ago and nothing has happened to it since. Give each to someone, take it, or archive it.";
      const tail = more ? `And ${more} more on Needs you.` : "";
      const urlOf = (id: string) => `${origin}/hub/w/${id}`;
      const lines = [
        intro,
        "",
        ...listed.flatMap((w) => [`- ${w.title}`, `  ${urlOf(w.id)}`]),
        ...(tail ? ["", tail] : []),
        "",
        `  ${origin}/hub`,
      ];
      const html = shell({
        origin: env.PUBLIC_ORIGIN,
        preview:
          n === 1 ? (listed[0]?.title ?? subject) : `${n} pieces of work are waiting on someone`,
        heading: subject,
        body: [
          p(esc(intro)),
          p(listed.map((w) => link(w.title, urlOf(w.id))).join("<br>")),
          ...(tail ? [p(esc(tail))] : []),
          button("Open Needs you", `${origin}/hub`),
        ],
      });
      if (await sendMail(env, person.email, subject, lines, html)) {
        await markMailed(
          db,
          person.work.map((w) => w.notification),
          at,
        );
        mailed++;
      }
    }
  } catch (err) {
    console.error("untaken mail", (err as Error).message);
  }
  return mailed;
}
