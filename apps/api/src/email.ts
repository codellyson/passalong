// The mail itself: six messages, each written as plain-text lines first and decorated second.
//
// The text half is not a fallback nobody sees — it is what a terminal client, a screen reader in
// plain-text mode and a spam filter all read. `mail-send.ts` is the transport under this,
// `mail-html.ts` is the kit the second half is built from, and `mail-copy.ts` holds the words —
// the subject, the preview and the text half — where a test can read them.
//
// Every name passed in here is a display name (see `displayName` in notify.ts): somebody's own
// typing, so it is escaped wherever it lands in markup.
import {
  askedCopy,
  doneCopy,
  FIX_AND_RESEND,
  handoffCopy,
  hubUrl,
  openedCopy,
  repliedCopy,
  verdictCopy,
} from "./mail-copy.js";
import { b, button, footnote, link, p, quote, shell } from "./mail-html.js";
import { type MailEnv, sendMail } from "./mail-send.js";

export type { MailEnv, SendEmail } from "./mail-send.js";
export { fromLine, sendMail } from "./mail-send.js";

const MUTED = "#6b6862";

/** The footer line that points at everything, rather than at a command. */
const seeEverything = (env: MailEnv) =>
  footnote(`See everything in one place: ${link("your hub", hubUrl(env.PUBLIC_ORIGIN))}.`);

export function sendHandoff(
  env: MailEnv,
  o: { to: string; fromName: string; title: string; id: string; url: string; team: string },
) {
  const copy = handoffCopy(o);
  return sendMail(
    env,
    o.to,
    copy.subject,
    copy.text,
    shell({
      origin: env.PUBLIC_ORIGIN,
      preview: copy.preview,
      eyebrow: copy.eyebrow,
      heading: o.title,
      body: [
        button("Open the guide", o.url),
        p(
          `You can answer there: say whether you're taking it or passing it on. Until you do, ` +
            `${b(o.fromName)} can't tell whether you have seen it.`,
        ),
        p(
          "Once you have tried it, say whether it worked. It's the only word they get back.",
          MUTED,
        ),
      ],
      // The CLI is for whoever lives in a terminal or hands this to an agent. The archiving verb is
      // not mentioned: what the sender is owed is whether it worked, not that it was put away.
      foot: [
        footnote(
          `Using a terminal or an agent? <code>passalong pull ${o.id}</code>, then ` +
            `<code>passalong works ${o.id}</code> once you have tried it.`,
        ),
      ],
    }),
  );
}

/** The other half of the loop: telling the sender somebody opened what they sent. */
export function sendPulled(
  env: MailEnv,
  o: { to: string; byName: string; title: string; url: string },
) {
  const copy = openedCopy({ ...o, hub: hubUrl(env.PUBLIC_ORIGIN) });
  return sendMail(
    env,
    o.to,
    copy.subject,
    copy.text,
    shell({
      origin: env.PUBLIC_ORIGIN,
      preview: copy.preview,
      eyebrow: copy.eyebrow,
      heading: o.title,
      tone: "ok",
      body: [
        p("They have it. What's still open is whether it worked for them."),
        button("Open the guide", o.url),
      ],
      foot: [seeEverything(env)],
    }),
  );
}

/** Somebody who is not the author is done with a guide. */
export function sendConsumed(
  env: MailEnv,
  o: { to: string; byName: string; title: string; url: string },
) {
  const copy = doneCopy({ ...o, hub: hubUrl(env.PUBLIC_ORIGIN) });
  return sendMail(
    env,
    o.to,
    copy.subject,
    copy.text,
    shell({
      origin: env.PUBLIC_ORIGIN,
      preview: copy.preview,
      eyebrow: copy.eyebrow,
      heading: o.title,
      tone: "ok",
      body: [
        p(`${b(o.byName)} is done with what you sent. Nothing is waiting on either of you.`),
        button("Open the guide", o.url),
      ],
      foot: [seeEverything(env)],
    }),
  );
}

/** An agent is waiting on a person's answer. The question is quoted, because it is the message. */
export function sendAsked(
  env: MailEnv,
  o: { to: string; byName: string; title: string; url: string; question: string },
) {
  const copy = askedCopy({ ...o, hub: hubUrl(env.PUBLIC_ORIGIN) });
  return sendMail(
    env,
    o.to,
    copy.subject,
    copy.text,
    shell({
      origin: env.PUBLIC_ORIGIN,
      preview: copy.preview,
      eyebrow: copy.eyebrow,
      heading: o.title,
      tone: "danger",
      body: [
        quote(o.question, "danger"),
        button("Answer it in the hub", hubUrl(env.PUBLIC_ORIGIN)),
      ],
      foot: [seeEverything(env)],
    }),
  );
}

/** A person wrote to an agent holding somebody else's work. */
export function sendReplied(
  env: MailEnv,
  o: { to: string; byName: string; title: string; url: string; body: string },
) {
  const copy = repliedCopy({ ...o, hub: hubUrl(env.PUBLIC_ORIGIN) });
  return sendMail(
    env,
    o.to,
    copy.subject,
    copy.text,
    shell({
      origin: env.PUBLIC_ORIGIN,
      preview: copy.preview,
      eyebrow: copy.eyebrow,
      heading: o.title,
      tone: "ok",
      body: [
        quote(o.body, "ok"),
        p("Your agent reads it the next time it checks in.", MUTED),
        button("Open the guide", o.url),
      ],
      foot: [seeEverything(env)],
    }),
  );
}

/** The verdict mail. A failure is the one notification nobody should have to go looking for. */
export function sendVerdict(
  env: MailEnv,
  o: {
    to: string;
    byName: string;
    title: string;
    url: string;
    ok: boolean;
    note: string;
  },
) {
  const copy = verdictCopy({ ...o, hub: hubUrl(env.PUBLIC_ORIGIN) });
  return sendMail(
    env,
    o.to,
    copy.subject,
    copy.text,
    shell({
      origin: env.PUBLIC_ORIGIN,
      preview: copy.preview,
      eyebrow: copy.eyebrow,
      heading: o.title,
      tone: o.ok ? "ok" : "danger",
      body: [
        ...(o.note ? [quote(o.note, o.ok ? "ok" : "danger")] : []),
        button("Open the guide", o.url),
        ...(o.ok ? [] : [p(FIX_AND_RESEND, MUTED)]),
      ],
      foot: [seeEverything(env)],
    }),
  );
}

/** The one mail that is a credential. Short-lived, single use, and never says who asked. */
export function sendReset(env: MailEnv, o: { to: string; url: string }) {
  return sendMail(
    env,
    o.to,
    "Reset your Passalong password",
    [
      "Someone asked to reset the password on this Passalong account.",
      "",
      `  ${o.url}`,
      "",
      "The link works once and expires in an hour. If it was not you, ignore this — nothing has",
      "changed, and whoever asked cannot see whether this address has an account.",
    ],
    shell({
      origin: env.PUBLIC_ORIGIN,
      preview: "The link works once and expires in an hour.",
      heading: "Reset your password",
      body: [
        p("Someone asked to reset the password on this Passalong account."),
        button("Choose a new password", o.url),
        p(
          "The link works once and expires in an hour. If it was not you, ignore this — nothing " +
            "has changed, and whoever asked cannot see whether this address has an account.",
          MUTED,
        ),
      ],
    }),
  );
}

export function sendInvite(env: MailEnv, o: { to: string; team: string; by: string; url: string }) {
  // The link comes first and alone. Whoever opens this may never have seen a terminal — a
  // tester, a designer — and an install command above the link reads as "this is not for you".
  return sendMail(
    env,
    o.to,
    `Join ${o.team} on Passalong`,
    [
      `${o.by} invited you to the ${o.team} team on Passalong.`,
      "",
      "Open this to join. Nothing to install:",
      `  ${o.url}`,
      "",
      "Passalong is how the team sends finished work to each other: what the problem was, how it",
      "was solved, how to check it, and what to watch out for.",
      "",
      `Prefer a terminal? npm i -g passalong && passalong team join ${o.url}`,
    ],
    shell({
      origin: env.PUBLIC_ORIGIN,
      preview: `${o.by} invited you. Nothing to install.`,
      eyebrow: `${o.by} invited you`,
      heading: `Join ${o.team} on Passalong`,
      body: [
        // The button first and alone, for the same reason the text version leads with the link:
        // whoever opens this may never have seen a terminal, and an install command above it
        // reads as "this is not for you".
        button("Join the team", o.url),
        p(
          "Nothing to install. Passalong is how a team sends finished work to each other — what " +
            "the problem was, how it was solved, how to check it, and what to watch out for.",
        ),
      ],
      foot: [
        footnote(
          `Prefer a terminal? <code>npm i -g passalong</code>, then ` +
            `<code>passalong team join</code> with ${link("that link", o.url)}.`,
        ),
      ],
    }),
  );
}
