// The words of each mail, apart from the markup they are poured into.
//
// Separate from email.ts for the same reason mail-send.ts is: this imports nothing, so a test can
// read exactly what a person will see in their inbox — the subject, the grey preview line, and the
// plain-text body. email.ts imports two siblings, which Node's type stripping cannot resolve.
//
// The rules every mail here follows:
//   - the subject and the preview say who did what, by name, and never carry an id;
//   - the one thing to do is open the guide, and anything the reader answers is answered there;
//   - a CLI command is a footnote for whoever uses a terminal or an agent, never the instruction.

export interface Copy {
  subject: string;
  /** The grey line beside the subject in an inbox list. */
  preview: string;
  /** The line above the heading in the HTML half. */
  eyebrow: string;
  /** The plain-text half, line by line. */
  text: string[];
}

/** Where "see everything" points: the hub, not a command. */
export const hubUrl = (origin?: string) =>
  `${(origin || "https://passalong.dev").replace(/\/$/, "")}/hub`;

/** What the author of a guide that did not work is told to do next. */
export const FIX_AND_RESEND =
  "Update the guide and share it again; the link you sent keeps working.";

export function handoffCopy(o: {
  fromName: string;
  title: string;
  id: string;
  url: string;
  team: string;
}): Copy {
  const where = o.team ? ` in ${o.team}` : "";
  return {
    subject: `${o.fromName} sent you "${o.title}"`,
    preview: `${o.fromName} sent you a guide${where}. Open it to take it.`,
    eyebrow: `${o.fromName} sent you a guide${where}`,
    text: [
      `${o.fromName} sent you "${o.title}"${where}.`,
      "",
      `Open the guide: ${o.url}`,
      "",
      "Take it there when you start: nobody else can take it while you hold it, and",
      `${o.fromName} sees you have it. Hand it in when it is done, with what you ran to show it.`,
      "",
      `Using a terminal or an agent? passalong take ${o.id}`,
    ],
  };
}

export function openedCopy(o: { byName: string; title: string; url: string; hub: string }): Copy {
  return {
    subject: `${o.byName} opened "${o.title}"`,
    preview: `${o.byName} opened your guide. What's still open is whether it worked for them.`,
    eyebrow: `${o.byName} opened it`,
    text: [
      `${o.byName} opened your guide "${o.title}".`,
      "",
      "What's still open is whether it worked for them.",
      "",
      `Open the guide: ${o.url}`,
      "",
      `See everything in one place: ${o.hub}`,
    ],
  };
}

/** Somebody who is not the author is done with a guide. The author archiving it sends nothing. */
export function doneCopy(o: { byName: string; title: string; url: string; hub: string }): Copy {
  return {
    subject: `${o.byName} is done with "${o.title}"`,
    preview: `${o.byName} is done with your guide. Nothing is waiting on either of you.`,
    eyebrow: `${o.byName} is done with it`,
    text: [
      `${o.byName} is done with your guide "${o.title}". Nothing is waiting on either of you.`,
      "",
      `Open the guide: ${o.url}`,
      "",
      `See everything in one place: ${o.hub}`,
    ],
  };
}

/**
 * An agent is waiting on a person. The question is the whole message: it is what the reader has to
 * answer, and the inbox is where they are standing when they decide whether to.
 */
export function askedCopy(o: {
  byName: string;
  title: string;
  url: string;
  question: string;
  hub: string;
}): Copy {
  return {
    subject: `${o.byName}'s agent has a question about "${o.title}"`,
    preview: o.question,
    eyebrow: "An agent is waiting on you",
    text: [
      `${o.byName}'s agent is working on "${o.title}" and needs an answer before it can go on.`,
      "",
      `  "${o.question}"`,
      "",
      `Answer it in the hub: ${o.hub}`,
      "",
      `Open the guide: ${o.url}`,
    ],
  };
}

/** A person wrote to the agent working on something of theirs. */
export function repliedCopy(o: {
  byName: string;
  title: string;
  url: string;
  body: string;
  hub: string;
}): Copy {
  return {
    subject: `${o.byName} replied to your agent on "${o.title}"`,
    preview: o.body,
    eyebrow: `${o.byName} replied`,
    text: [
      `${o.byName} wrote to your agent working on "${o.title}".`,
      "",
      `  "${o.body}"`,
      "",
      "Your agent reads it the next time it checks in.",
      "",
      `Open the guide: ${o.url}`,
      "",
      `See everything in one place: ${o.hub}`,
    ],
  };
}

export function verdictCopy(o: {
  byName: string;
  title: string;
  url: string;
  ok: boolean;
  note: string;
  hub: string;
}): Copy {
  const said = o.ok ? "worked" : "didn't work";
  return {
    subject: `${o.byName} said "${o.title}" ${said}`,
    // The reason goes in the preview, because on a failure it is the only thing the reader needs
    // and the inbox is where they are standing.
    preview: `${o.byName} said it ${said}${o.note ? `: ${o.note}` : "."}`,
    eyebrow: `${o.byName} said it ${said}`,
    text: [
      `${o.byName} tried "${o.title}" and said it ${said}.`,
      ...(o.note ? ["", `  "${o.note}"`] : []),
      "",
      `Open the guide: ${o.url}`,
      ...(o.ok ? [] : ["", FIX_AND_RESEND]),
      "",
      `See everything in one place: ${o.hub}`,
    ],
  };
}

/**
 * What a customer gets the moment they write in (docs/LOOP.md §4): that it arrived, the tracking
 * number, and that replying adds to it. Plain on purpose — it is from the team, not from Passalong,
 * and it promises nothing about when beyond "when it's sorted".
 */
export function ackCopy(o: { from: string; subject: string; ref: string }): Copy {
  return {
    subject: customerSubject(o),
    preview: `We've got your message. Your tracking number is ${o.ref}.`,
    eyebrow: o.from,
    text: [
      "Thanks — we've got your message, and we'll write back when it's sorted.",
      "",
      `Your tracking number is ${o.ref}. Reply to this email to add anything.`,
      "",
      `— ${o.from}`,
    ],
  };
}

/**
 * A reply written in the hub's editor, as a plain-text email reads: the customer's mail client draws
 * no markdown. A picture is its name and address, a link its words and address, formatting marks go,
 * and a code block keeps its lines. The thread keeps the markdown; only the email is flattened.
 */
export function plainForCustomer(md: string): string {
  return md
    .replace(/^```[^\n]*$/gm, "")
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, url) => `${alt || "Picture"}: ${url}`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) =>
      text === url ? url : `${text} (${url})`,
    )
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^*\w])[*_]([^*_\n]+)[*_](?=[^*\w]|$)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\\([\\`*_[\]])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The subject of every mail to a customer: a reply to the subject they wrote under, so it lands in
 * their own conversation, with the tracking number at the end for clients that thread by nothing else.
 */
export function customerSubject(o: { subject: string; ref: string }): string {
  const s = o.subject.replace(/^((re|fwd?|aw)\s*:\s*)+/i, "").trim() || "Your message";
  return `Re: ${s} [${o.ref}]`;
}

/** A person's answer to a customer, in the conversation the customer started. */
export function answerCopy(o: { from: string; subject: string; ref: string; body: string }): Copy {
  o = { ...o, body: plainForCustomer(o.body) };
  return {
    subject: customerSubject(o),
    preview: o.body.split("\n")[0]?.slice(0, 140) ?? "",
    eyebrow: o.from,
    text: [
      ...o.body.split("\n"),
      "",
      `— ${o.from}`,
      "",
      `Tracking number ${o.ref}. Reply to this email to write back.`,
    ],
  };
}
