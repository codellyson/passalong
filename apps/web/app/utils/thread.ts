/**
 * A thread line as a message: who said it, which side it sits on, and the words.
 *
 * The server sends facts — "progress, by this agent, with this note" — and this puts them in the
 * voice a person would use, so the conversation reads as one. Nothing here rewrites what an agent
 * wrote: a progress note, a reason and a verdict's note come through as they were sent, and a line
 * with nothing of its own to say gets a plain sentence for what happened.
 *
 * Imports only types, so it runs under `node --test` without Nuxt — which is why the name rule
 * from people.ts is written out here rather than imported.
 */
import type { ThreadItem } from "~/types/hub";

export interface Message {
  id: string;
  at: string;
  /** Who is speaking: an agent, you, or somebody else. */
  who: string;
  /** Where the agent is, for the line under its name. Empty for a person. */
  where: string;
  /** Your own words sit on the right. An agent's never do, even when it is yours. */
  mine: boolean;
  /** The words. */
  text: string;
  /** The thing said carries no words of its own and is a state change, shown quieter. */
  quiet: boolean;
  /** It points at one of our screenshots, so it is drawn as pictures and not as text. */
  pictures: boolean;
  /** Files attached to it, to be downloaded. Their lines are taken out of `text`. */
  files: { name: string; url: string }[];
  /** Negative: a decline, a failing verdict, a send-back, a pass. */
  tone: "neutral" | "bad";
}

/** One of our own screenshots, which is the only kind of picture a message may carry. */
const SHOT = /\/v1\/shots\/[a-z0-9]{6,16}/;

/** A file line: `[name](…/v1/attachments/<id>)` on its own. Capture 2 is the path, with no origin. */
const FILE_LINE =
  /^[ \t]*\[([^\]]*)\]\(https?:\/\/[^)\s]*?(\/v1\/attachments\/[a-z0-9]{6,16})\)[ \t]*$/gm;

/** The most a message may say, as the server keeps it. A picture or a file is a line of it. */
export const REPLY_MAX = 1000;

/** The most one reply carries, pictures and files together: it is a reply, not a folder. */
export const REPLY_ATTACHMENTS = 3;

/** A thing attached to a reply and not yet sent: a picture drawn in the thread, or a file saved from it. */
export interface Attached {
  kind: "image" | "file";
  name: string;
  url: string;
}

/**
 * A reply as it is sent: the words, then each picture as a markdown line. Words first because they
 * are what is being said; a picture is evidence for them. `over` says how far past the limit it is,
 * so the composer can refuse before the server would silently cut a picture's address in half.
 */
export function composeReply(text: string, attached: Attached[]): { body: string; over: number } {
  const lines = attached.map((a) => {
    const name = a.name.replace(/[\][()]/g, "");
    return a.kind === "image" ? `![${name}](${a.url})` : `[${name}](${a.url})`;
  });
  const body = [text.trim(), ...lines].filter(Boolean).join("\n");
  return { body, over: Math.max(0, body.length - REPLY_MAX) };
}

const said = (lead: string, body: string) => (body ? `${lead}: ${body}` : lead);

export function messageOf(i: ThreadItem): Message {
  const { by } = i;
  const who = by.agent
    ? "Agent"
    : by.you
      ? "You"
      : by.name.trim() || (by.handle ? `@${by.handle}` : "Someone");
  let text = i.body;
  let quiet = false;
  let tone: Message["tone"] = "neutral";
  switch (i.kind) {
    case "taken":
      text = "Taking this.";
      quiet = true;
      break;
    case "progress":
      break;
    case "handed_in":
      text = i.body || "Done. It is ready for you to look at.";
      break;
    case "passed":
      text = said("Handing this back", i.body);
      tone = "bad";
      break;
    case "released":
      text = "Took this back.";
      quiet = true;
      break;
    case "approved":
      text = "Approved.";
      break;
    case "sent_back":
      text = said("Sent back", i.body);
      tone = "bad";
      break;
    case "asked":
      // The question as it was asked: it is the agent speaking, and it is what is being waited on.
      break;
    case "replied":
      break;
    case "noted":
      // Left on the task before anybody took it: the author speaking to whoever does.
      break;
    case "closed":
      text = "Closed.";
      quiet = true;
      break;
    case "verdict":
      text = i.ok ? said("It works", i.body) : said("It does not work", i.body);
      tone = i.ok ? "neutral" : "bad";
      break;
    case "ack":
      text = i.ok ? "On it." : said("Not me", i.body);
      tone = i.ok ? "neutral" : "bad";
      quiet = Boolean(i.ok) && !i.body;
      break;
  }
  // A file is a line of its own, `[name](…/v1/attachments/<id>)`, and is shown as something to
  // download rather than as the markdown that carries it. The path is kept and the origin dropped, so
  // whichever origin the reader is on serves it.
  const files = [...text.matchAll(FILE_LINE)].map((m) => ({
    name: (m[1] ?? "").trim() || "file",
    url: m[2] ?? "",
  }));
  if (files.length)
    text = text
      .replace(FILE_LINE, "")
      .replace(/\n{2,}/g, "\n")
      .trim();
  return {
    id: i.id,
    at: i.at,
    who,
    where: by.agent ? by.host : "",
    mine: by.you && !by.agent,
    text,
    files,
    pictures: SHOT.test(text),
    quiet,
    tone,
  };
}

/**
 * Consecutive messages from the same speaker, so the name is said once and not on every line.
 * A gap of more than ten minutes starts a new group, because by then it is a new thing being said.
 */
export function grouped(items: ThreadItem[]): { key: string; messages: Message[] }[] {
  const out: { key: string; messages: Message[]; last: number }[] = [];
  for (const i of items) {
    const m = messageOf(i);
    const t = Date.parse(m.at);
    const tail = out[out.length - 1];
    const same = tail && tail.messages[0]?.who === m.who && tail.messages[0]?.mine === m.mine;
    if (same && tail && t - tail.last < 10 * 60 * 1000) {
      tail.messages.push(m);
      tail.last = t;
    } else out.push({ key: m.id, messages: [m], last: t });
  }
  return out.map(({ key, messages }) => ({ key, messages }));
}
