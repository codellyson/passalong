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
import { button, esc, p, shell } from "./mail-html.js";
import { type MailEnv, sendMail } from "./mail-send.js";
import { type Event, type Kind, type LineFacts, line, type NotifyEnv, notify } from "./notify.js";

/** The kinds that go to admins, each with the mail subject that announces it. */
export const ADMIN_ALERTS: Partial<Record<Kind, string>> = {
  signed_up: "New Passalong sign-up",
  billed_twice: "Someone is being charged twice",
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
      `SELECT id, email FROM account
       WHERE role = 'super' OR id IN (SELECT value FROM json_each(?))`,
    )
      .bind(JSON.stringify(owners))
      .all<{ id: string; email: string }>();
    const who = e.actor_id
      ? await env.DB.prepare("SELECT handle, name FROM account WHERE id = ?")
          .bind(e.actor_id)
          .first<{ handle: string; name: string }>()
      : null;
    // The same sentence the feed shows, so the mail and the hub never say it two ways.
    const facts: LineFacts = {
      kind: e.kind,
      title: "",
      times: 1,
      note: e.note || "",
      actor_id: e.actor_id || "",
      actor: who?.handle || "",
      actor_real: who?.name || "",
    };
    const text = line(facts);
    const url = `${(env.PUBLIC_ORIGIN || "https://passalong.dev").replace(/\/$/, "")}/admin`;
    for (const admin of results)
      await notify(env, {
        ...e,
        to: admin.id,
        mail: admin.email
          ? () =>
              sendMail(
                env,
                admin.email,
                subject,
                [text, "", `  ${url}`],
                shell({
                  origin: env.PUBLIC_ORIGIN,
                  preview: text,
                  heading: subject,
                  body: [p(esc(text)), button("Open the admin page", url)],
                }),
              )
          : undefined,
      });
  } catch (err) {
    console.error("alert", e.kind, (err as Error).message);
  }
}
