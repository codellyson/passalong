// Transactional mail through Cloudflare Email Service: a Worker binding, no API key, no vendor
// SDK. Optional by design — without the EMAIL binding (local dev, or before the sender domain is
// onboarded) nothing is sent and the caller carries on, because the notification row is the
// record and mail is only a channel over it.
//
// Two setup facts that decide whether a send succeeds:
//   - EMAIL_FROM must be on a domain onboarded to Email Service, or every send is
//     E_SENDER_NOT_VERIFIED.
//   - Sending to arbitrary recipients needs the Workers Paid plan. On any plan you may send to
//     addresses verified as Email Routing destinations in the same account, free.

/** The `send_email` binding. Typed here so the app does not depend on the beta type shipping. */
export interface SendEmail {
  send(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
}

export type MailEnv = { EMAIL?: SendEmail; EMAIL_FROM?: string };

const DEFAULT_FROM = "no-reply@passalong.kreativekorna.com";

/**
 * Send one plain-text mail. Never throws: a bounced or unconfigured mailer must not fail the
 * request that triggered it. Returns whether it actually went out.
 */
export async function sendMail(
  env: MailEnv,
  to: string,
  subject: string,
  lines: string[],
): Promise<boolean> {
  if (!env.EMAIL || !to) return false;
  try {
    await env.EMAIL.send({
      from: env.EMAIL_FROM || DEFAULT_FROM,
      to,
      subject,
      text: lines.join("\n"),
    });
    return true;
  } catch (e) {
    const code = (e as { code?: string }).code || "";
    console.error("email", code, (e as Error).message);
    return false;
  }
}

export function sendHandoff(
  env: MailEnv,
  o: { to: string; fromHandle: string; title: string; id: string; url: string; team: string },
) {
  return sendMail(env, o.to, `@${o.fromHandle} passed you a guide: ${o.title}`, [
    `@${o.fromHandle} handed off "${o.title}" to you in ${o.team}.`,
    "",
    "Pull it into the repo where you'll implement it:",
    `  passalong pull ${o.id}`,
    "",
    `Or read it first: ${o.url}`,
    "",
    `Mark it done when it lands: passalong done ${o.id}`,
  ]);
}

/** The other half of the loop: telling the sender their transfer landed. */
export function sendPulled(
  env: MailEnv,
  o: { to: string; byHandle: string; title: string; id: string; url: string },
) {
  const who = o.byHandle ? `@${o.byHandle}` : "someone with the link";
  return sendMail(env, o.to, `${who} pulled "${o.title}"`, [
    `${who} pulled your guide "${o.title}" (${o.id}).`,
    "",
    `  ${o.url}`,
    "",
    "See everything waiting on you: passalong activity",
  ]);
}

export function sendConsumed(
  env: MailEnv,
  o: { to: string; byHandle: string; title: string; id: string },
) {
  return sendMail(env, o.to, `@${o.byHandle} shipped "${o.title}"`, [
    `@${o.byHandle} marked your guide "${o.title}" (${o.id}) consumed — it landed on the other side.`,
    "",
    "If this one keeps getting pulled, graduate it into a reference:",
    `  passalong promote ${o.id}`,
  ]);
}

export function sendInvite(env: MailEnv, o: { to: string; team: string; by: string; url: string }) {
  return sendMail(env, o.to, `Join ${o.team} on Passalong`, [
    `${o.by} invited you to the ${o.team} team on Passalong.`,
    "",
    "If you don't have the CLI yet:",
    "  npm i -g passalong && passalong setup && passalong login",
    "",
    "Then join:",
    `  passalong team join ${o.url}`,
  ]);
}
