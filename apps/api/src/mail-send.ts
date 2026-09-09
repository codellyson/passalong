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
//
// The transport, apart from the templates. It imports nothing, which is what makes it testable:
// Node's type stripping cannot resolve a sibling `./x.js` import, and email.ts has two of them.
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

export type MailEnv = {
  EMAIL?: SendEmail;
  EMAIL_FROM?: string;
  /** How the sender is named in an inbox list. Empty sends the bare address. */
  EMAIL_FROM_NAME?: string;
  /** The canonical host. The mark and the masthead link are absolute, as everything in a mail is. */
  PUBLIC_ORIGIN?: string;
};

const DEFAULT_FROM = "no-reply@passalong.dev";
const DEFAULT_FROM_NAME = "Passalong";

/**
 * The sender, as an inbox lists it.
 *
 * A bare address leaves Gmail to show the local part, so every mail from the product arrived from
 * "no-reply" — which names the one thing the sender cannot do rather than who it is. RFC 5322's
 * display-name form fixes that, and it is quoted because the name is configurable and a comma or a
 * colon in it would otherwise split the header.
 */
export function fromLine(address: string, name: string): string {
  const clean = name.trim().replace(/["\\]/g, "");
  return clean ? `"${clean}" <${address}>` : address;
}

/**
 * Send one mail, in both parts. Never throws: a bounced or unconfigured mailer must not fail the
 * request that triggered it. Returns whether it actually went out.
 *
 * The text half is not a fallback nobody sees — it is what a terminal client, a screen reader in
 * plain-text mode and a spam filter all read, and it is why every mail here is written as lines
 * first and decorated second.
 */
export async function sendMail(
  env: MailEnv,
  to: string,
  subject: string,
  lines: string[],
  html?: string,
): Promise<boolean> {
  if (!env.EMAIL || !to) return false;
  const address = env.EMAIL_FROM || DEFAULT_FROM;
  const named = fromLine(address, env.EMAIL_FROM_NAME ?? DEFAULT_FROM_NAME);
  const message = {
    to,
    subject,
    text: lines.join("\n"),
    ...(html ? { html } : {}),
  };
  try {
    await env.EMAIL.send({ from: named, ...message });
    return true;
  } catch (e) {
    const code = (e as { code?: string }).code || "";
    console.error("email", code, (e as Error).message);
    // A sender this service will not parse must cost the display name, not the mail. Failure here
    // is silent by design — nothing upstream is allowed to fail because a mail did — so a strict
    // validator would otherwise stop every notification with nothing to show for it.
    if (named !== address) {
      try {
        await env.EMAIL.send({ from: address, ...message });
        console.error("email", "sender-name-refused", "sent as the bare address");
        return true;
      } catch (retry) {
        console.error("email", "retry", (retry as Error).message);
      }
    }
    return false;
  }
}

/**
 * Somebody handed you work. The one mail that is addressed rather than announced.
 *
 * It used to end with "mark it done when it lands: passalong done <id>", which is now the wrong
 * instruction twice over: `done` archives a guide, and what the sender is actually owed is whether
 * it worked. So the mail ends where the loop does — `works` or `broken`.
 */
