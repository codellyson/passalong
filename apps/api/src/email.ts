// The mail itself: six messages, each written as plain-text lines first and decorated second.
//
// The text half is not a fallback nobody sees — it is what a terminal client, a screen reader in
// plain-text mode and a spam filter all read. `mail-send.ts` is the transport under this, and
// `mail-html.ts` is the kit the second half is built from.
import { b, button, command, footnote, link, mono, p, quote, shell } from "./mail-html.js";
import { type MailEnv, sendMail } from "./mail-send.js";

export type { MailEnv, SendEmail } from "./mail-send.js";
export { fromLine, sendMail } from "./mail-send.js";

export function sendHandoff(
  env: MailEnv,
  o: { to: string; fromHandle: string; title: string; id: string; url: string; team: string },
) {
  const where = o.team ? ` in ${o.team}` : "";
  const lines = [
    `@${o.fromHandle} handed off "${o.title}" to you${where}.`,
    "",
    `Read it: ${o.url}`,
    "",
    "Say whether you are doing it, before you start — otherwise they cannot tell an unanswered",
    "handoff from an unnoticed one:",
    `  passalong take ${o.id}`,
    `  passalong pass ${o.id} <why it is not yours>`,
    "",
    "Pull it into the repo where you'll implement it:",
    `  passalong pull ${o.id}`,
    "",
    "When you have run it, tell them how it went — it is the only signal they get:",
    `  passalong works ${o.id}`,
    `  passalong broken ${o.id} <what happened>`,
  ];
  return sendMail(
    env,
    o.to,
    `@${o.fromHandle} passed you a guide: ${o.title}`,
    lines,
    shell({
      origin: env.PUBLIC_ORIGIN,
      preview: `From @${o.fromHandle}${where}. Pull it with passalong pull ${o.id}.`,
      eyebrow: `@${o.fromHandle} handed you a guide${where}`,
      heading: o.title,
      body: [
        button("Read the guide", o.url),
        p(
          `Say whether you are doing it before you start — until you do, ${b(`@${o.fromHandle}`)} ` +
            `cannot tell an unanswered handoff from an unnoticed one. One line in the hub, or ` +
            `${mono(`passalong take ${o.id}`)}.`,
        ),
        command("then pull it into your repo", `passalong pull ${o.id}`),
        p(
          `When you have run it, say how it went — it is the only signal they get: ` +
            `${mono(`passalong works ${o.id}`)}, or ${mono("broken")} with a reason.`,
          "#6b6862",
        ),
      ],
    }),
  );
}

/** The other half of the loop: telling the sender their transfer landed. */
export function sendPulled(
  env: MailEnv,
  o: { to: string; byHandle: string; title: string; id: string; url: string },
) {
  const who = o.byHandle ? `@${o.byHandle}` : "someone with the link";
  return sendMail(
    env,
    o.to,
    `${who} pulled "${o.title}"`,
    [
      `${who} pulled your guide "${o.title}" (${o.id}).`,
      "",
      `  ${o.url}`,
      "",
      "See everything waiting on you: passalong activity",
    ],
    shell({
      origin: env.PUBLIC_ORIGIN,
      preview: `Your transfer landed. ${who} has it.`,
      eyebrow: `${who} pulled it`,
      heading: o.title,
      tone: "ok",
      body: [
        p("They have it. What is still open is whether it worked for them."),
        button("Open the guide", o.url),
      ],
      foot: [footnote("Everything at once: <code>passalong activity</code>.")],
    }),
  );
}

export function sendConsumed(
  env: MailEnv,
  o: { to: string; byHandle: string; title: string; id: string },
) {
  return sendMail(
    env,
    o.to,
    `@${o.byHandle} shipped "${o.title}"`,
    [
      `@${o.byHandle} marked your guide "${o.title}" (${o.id}) consumed — it landed on the other side.`,
      "",
      "If this one keeps getting pulled, graduate it into a reference:",
      `  passalong promote ${o.id}`,
    ],
    shell({
      origin: env.PUBLIC_ORIGIN,
      preview: `@${o.byHandle} shipped it. The loop is closed.`,
      eyebrow: `@${o.byHandle} shipped it`,
      heading: o.title,
      tone: "ok",
      body: [
        p("They implemented what you handed over. Nothing is waiting on either of you."),
        command("if this one keeps getting pulled, graduate it", `passalong promote ${o.id}`),
      ],
    }),
  );
}

/** The verdict mail. A failure is the one notification nobody should have to go looking for. */
export function sendVerdict(
  env: MailEnv,
  o: {
    to: string;
    byHandle: string;
    title: string;
    id: string;
    url: string;
    ok: boolean;
    note: string;
  },
) {
  const who = o.byHandle ? `@${o.byHandle}` : "someone";
  return sendMail(
    env,
    o.to,
    o.ok ? `${who} verified "${o.title}"` : `${who} could not get "${o.title}" working`,
    [
      o.ok
        ? `${who} tried "${o.title}" (${o.id}) and it holds up.`
        : `${who} tried "${o.title}" (${o.id}) and it does not work.`,
      ...(o.note ? ["", `  "${o.note}"`] : []),
      "",
      `  ${o.url}`,
      ...(o.ok
        ? []
        : ["", "The guide is still published; fix it and share again with the same id."]),
    ],
    shell({
      origin: env.PUBLIC_ORIGIN,
      // The reason goes in the preview line, because on a failure it is the only thing the reader
      // actually needs and the inbox is where they are standing.
      preview: o.note || (o.ok ? "It holds up." : "It does not work."),
      eyebrow: o.ok ? `${who} verified it` : `${who} says it does not work`,
      heading: o.title,
      tone: o.ok ? "ok" : "danger",
      body: [
        ...(o.note ? [quote(o.note, o.ok ? "ok" : "danger")] : []),
        button("Open the guide", o.url),
        ...(o.ok
          ? []
          : [
              p(
                "It is still published, so fix it and share again with the same id — the link you " +
                  "already sent keeps working.",
                "#6b6862",
              ),
            ]),
      ],
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
          "#6b6862",
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
      "Passalong is how the team hands finished work to each other: what the problem was, how it",
      "was solved, how to verify it, and what to watch out for.",
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
          "Nothing to install. Passalong is how a team hands finished work to each other — what " +
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
