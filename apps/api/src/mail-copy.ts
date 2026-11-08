// The words of each mail, apart from the markup they are poured into.
//
// Separate from email.ts for the same reason mail-send.ts is: this imports nothing, so a test can
// read exactly what a person will see in their inbox — the subject, the grey preview line, and the
// plain-text body. email.ts imports two siblings, which Node's type stripping cannot resolve.
//
// The rules every mail here follows:
//   - the subject and the preview say who did what, by name, and never carry an id;
//   - the one thing to do is open the work, and anything the reader answers is answered there;
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

export function sentToYouCopy(o: {
  fromName: string;
  title: string;
  id: string;
  url: string;
  team: string;
}): Copy {
  const where = o.team ? ` in ${o.team}` : "";
  return {
    subject: `${o.fromName} sent you "${o.title}"`,
    preview: `${o.fromName} sent you work${where}. Open it to take it.`,
    eyebrow: `${o.fromName} sent you work${where}`,
    text: [
      `${o.fromName} sent you "${o.title}"${where}.`,
      "",
      `Open it: ${o.url}`,
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
    preview: `${o.byName} opened your work.`,
    eyebrow: `${o.byName} opened it`,
    text: [
      `${o.byName} opened "${o.title}".`,
      "",
      `Open it: ${o.url}`,
      "",
      `See everything in one place: ${o.hub}`,
    ],
  };
}

/** Somebody who is not the author is done with a piece of work. The author archiving it sends nothing. */
export function doneCopy(o: { byName: string; title: string; url: string; hub: string }): Copy {
  return {
    subject: `${o.byName} is done with "${o.title}"`,
    preview: `${o.byName} is done with your work. Nothing is waiting on either of you.`,
    eyebrow: `${o.byName} is done with it`,
    text: [
      `${o.byName} is done with "${o.title}". Nothing is waiting on either of you.`,
      "",
      `Open it: ${o.url}`,
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
  /** Its options, each with the link that picks it (0074_choice_link.sql); none for a plain question. */
  choices?: { label: string; url: string }[];
}): Copy {
  const picks = o.choices ?? [];
  return {
    subject: `${o.byName}'s agent has a question about "${o.title}"`,
    preview: o.question,
    eyebrow: "An agent is waiting on you",
    text: [
      `${o.byName}'s agent is working on "${o.title}" and needs an answer before it can go on.`,
      "",
      `  "${o.question}"`,
      "",
      ...(picks.length
        ? ["Pick one:", ...picks.map((c, n) => `  ${n + 1}. ${c.label}: ${c.url}`), ""]
        : []),
      `${picks.length ? "Or answer" : "Answer"} it in the hub: ${o.hub}`,
      "",
      `Open it: ${o.url}`,
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
      `Open it: ${o.url}`,
      "",
      `See everything in one place: ${o.hub}`,
    ],
  };
}

/**
 * Markdown as a plain-text email reads: a mail client draws none of it. A picture is its name and
 * address, a link its words and address, formatting marks go, and a code block keeps its lines.
 */
export function plainMail(md: string): string {
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
 * Product news from whoever runs Passalong (src/announcements.ts), written in /admin as a little
 * markdown. The text half is that markdown flattened (`plainMail`), and it ends with the two things a newsletter owes its reader: why it came, and how to stop it.
 */
export function newsCopy(o: {
  subject: string;
  body: string;
  off: string;
  settings: string;
}): Copy {
  const body = plainMail(o.body);
  const first =
    body
      .split(/\n\s*\n/)[0]
      ?.replace(/\s+/g, " ")
      .trim() ?? "";
  return {
    subject: o.subject,
    preview: first.length > 140 ? `${first.slice(0, 139).trimEnd()}…` : first,
    eyebrow: "What's new in Passalong",
    text: [
      ...body.split("\n"),
      "",
      "--",
      "You're getting this because you have a Passalong account. Mail about your work is separate",
      "and keeps coming either way.",
      `Stop product news: ${o.off}`,
      `Or turn it off in Settings: ${o.settings}`,
    ],
  };
}
