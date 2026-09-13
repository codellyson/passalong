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
    preview: `${o.fromName} sent you a guide${where}. Open it to say whether you're taking it.`,
    eyebrow: `${o.fromName} sent you a guide${where}`,
    text: [
      `${o.fromName} sent you "${o.title}"${where}.`,
      "",
      `Open the guide: ${o.url}`,
      "",
      "You can answer there: say whether you're taking it or passing it on, and once you have",
      `tried it, whether it worked. It's the only word ${o.fromName} gets back.`,
      "",
      `Using a terminal or an agent? passalong pull ${o.id}`,
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
