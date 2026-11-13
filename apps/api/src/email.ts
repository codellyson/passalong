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
  hubUrl,
  newsCopy,
  openedCopy,
  repliedCopy,
  sentToYouCopy,
} from "./mail-copy.js";
import {
  b,
  button,
  FIRST_NAME,
  firstName,
  footnote,
  link,
  p,
  prose,
  quote,
  shell,
} from "./mail-html.js";
import { type MailEnv, sendMail } from "./mail-send.js";

export type { MailEnv, SendEmail } from "./mail-send.js";
export { fromLine, sendMail } from "./mail-send.js";

const MUTED = "#6b6862";

/** The footer line that points at everything, rather than at a command. */
const seeEverything = (env: MailEnv) =>
  footnote(`See everything in one place: ${link("your hub", hubUrl(env.PUBLIC_ORIGIN))}.`);

export function sendSentToYou(
  env: MailEnv,
  o: { to: string; fromName: string; title: string; id: string; url: string; team: string },
) {
  const copy = sentToYouCopy(o);
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
        button("Open it", o.url),
        p(
          `Take it there when you start: nobody else can take it while you hold it, and ` +
            `${b(o.fromName)} sees you have it.`,
        ),
        p("Hand it in when it is done, with what you ran to show it.", MUTED),
      ],
      // The CLI is for whoever lives in a terminal or hands this to an agent: the same verb as the
      // button, so every kind is taken the one way.
      foot: [
        footnote(
          `Using a terminal or an agent? <code>passalong take ${o.id}</code>, and hand it in ` +
            "when it is done.",
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
        button("Open it", o.url),
      ],
      foot: [seeEverything(env)],
    }),
  );
}

/** Somebody who is not the author is done with a piece of work. */
export function sendArchived(
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
        button("Open it", o.url),
      ],
      foot: [seeEverything(env)],
    }),
  );
}

/** An agent is waiting on a person's answer. The question is quoted, because it is the message. */
export function sendAsked(
  env: MailEnv,
  o: {
    to: string;
    byName: string;
    title: string;
    url: string;
    question: string;
    /** A button per option, each picking it (0074_choice_link.sql). */
    choices?: { label: string; url: string }[];
  },
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
      // With options, a button for each: one tap picks it, from wherever the mail is read.
      body: o.choices?.length
        ? [
            quote(o.question, "danger"),
            ...o.choices.map((c, n) => button(`${n + 1}. ${c.label}`, c.url)),
            p(`Or ${link("answer it in the hub", hubUrl(env.PUBLIC_ORIGIN))}.`, MUTED),
          ]
        : [quote(o.question, "danger"), button("Answer it in the hub", hubUrl(env.PUBLIC_ORIGIN))],
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
        button("Open it", o.url),
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
      "The link works once and expires in an hour. If it was not you, ignore this: nothing has",
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
          "The link works once and expires in an hour. If it was not you, ignore this: nothing " +
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
          "Nothing to install. Passalong is how a team sends finished work to each other: what " +
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

/** Proving the address reaches its owner. A credential like reset's: single use, and short-lived. */
export function sendVerify(env: MailEnv, o: { to: string; url: string }) {
  return sendMail(
    env,
    o.to,
    "Confirm your email for Passalong",
    [
      "Confirm this is your email, so Passalong can reach you about work sent to you:",
      "",
      `  ${o.url}`,
      "",
      "The link works once and expires in a week. If you did not sign up, ignore this.",
    ],
    shell({
      origin: env.PUBLIC_ORIGIN,
      preview: "The link works once and expires in a week.",
      heading: "Confirm your email",
      body: [
        p("Confirm this is your email, so Passalong can reach you about work sent to you."),
        button("Confirm my email", o.url),
        p("The link works once and expires in a week. If you did not sign up, ignore this.", MUTED),
      ],
    }),
  );
}

/** Sent only when whoever suspended the account from the admin hub asked for it (admin-users.ts). */
export function sendSuspended(env: MailEnv, o: { to: string }) {
  const said =
    "Your Passalong account has been suspended. You can't sign in, and its tokens and connectors no longer work.";
  return sendMail(
    env,
    o.to,
    "Your Passalong account is suspended",
    [said],
    shell({
      origin: env.PUBLIC_ORIGIN,
      preview: "You can't sign in while it is suspended.",
      heading: "Your account is suspended",
      body: [p(said)],
    }),
  );
}

/** The confirmation after an account is deleted from the admin hub (delete-account.ts). */
export function sendDeleted(env: MailEnv, o: { to: string }) {
  const said =
    "Your Passalong account has been deleted, with your private work, your personal projects and everything you uploaded to them. Anything you wrote into someone else's team stays with that team, no longer under your name.";
  return sendMail(
    env,
    o.to,
    "Your Passalong account is deleted",
    [said],
    shell({
      origin: env.PUBLIC_ORIGIN,
      preview: "Your account and your private work are gone.",
      heading: "Your account is deleted",
      body: [p(said)],
    }),
  );
}

/**
 * Product news (src/announcements.ts). Sent from `NEWS_FROM` when the deployment sets one, so a
 * newsletter's complaints land on a different sender from the mail about people's work; otherwise
 * from the usual address. Replies go to support, because "just reply" is what a reader will do.
 *
 * The stop link is in the footer of both halves, and in the headers that let Gmail, Yahoo and
 * Apple Mail show their own Unsubscribe button (RFC 2369 and RFC 8058). Those headers must name an
 * https address, so a local server without one sends the mail without them.
 *
 * `{{first_name}}` becomes the first word of `name`, or "there"; escaped wherever it lands in HTML.
 */
export function newsMail(
  env: MailEnv,
  o: { subject: string; body: string; off: string; oneClick: string; name?: unknown },
) {
  const settings = `${hubUrl(env.PUBLIC_ORIGIN)}/settings#news`;
  const first = firstName(o.name);
  const fill = (s: string) => s.replaceAll(FIRST_NAME, first);
  const copy = newsCopy({ subject: fill(o.subject), body: o.body, off: o.off, settings });
  const headers: Record<string, string> = o.oneClick.startsWith("https://")
    ? {
        "List-Unsubscribe": `<${o.oneClick}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : {};
  const html = shell({
    origin: env.PUBLIC_ORIGIN,
    preview: fill(copy.preview),
    eyebrow: copy.eyebrow,
    heading: copy.subject,
    body: [prose(o.body, first)],
    foot: [
      footnote(
        "You're getting this because you have a Passalong account. Mail about your work is " +
          "separate and keeps coming either way.",
      ),
      footnote(`${link("Stop product news", o.off)} · ${link("Settings", settings)}`),
    ],
  });
  return { subject: copy.subject, text: copy.text.map(fill), html, headers };
}

export function sendNews(
  env: MailEnv & { NEWS_FROM?: string },
  o: {
    to: string;
    subject: string;
    body: string;
    off: string;
    oneClick: string;
    replyTo: string;
    name?: unknown;
  },
) {
  const m = newsMail(env, o);
  return sendMail(
    env.NEWS_FROM ? { ...env, EMAIL_FROM: env.NEWS_FROM } : env,
    o.to,
    m.subject,
    m.text,
    m.html,
    { replyTo: o.replyTo, headers: m.headers },
  );
}
