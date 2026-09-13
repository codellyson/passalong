// The notification spine. Four moments matter, and each one is a row addressed to the account
// that should hear about it:
//
//   handoff   a guide was addressed to you by name
//   shared    a guide landed in a team you are in
//   taken     someone said they are on it — the first word back, before any work
//   declined  someone said it is not theirs, and why — the one that needs re-homing
//   pulled    someone pulled your guide — the transfer landed
//   consumed  the receiver marked your guide done
//   reopened  and put it back — the other half of that pair, which used to happen in silence
//   verified  someone tried it and it holds up
//   failed    someone tried it and it does not — the one people need to see today
//   joined    someone accepted your invite
//
// Rows first, delivery second. `line()` renders the one sentence every surface shows (CLI, MCP,
// hub), so the wording is decided once here rather than three times.

import type { MailEnv } from "./email.js";

export const KINDS = [
  "handoff",
  "shared",
  "taken",
  "declined",
  "pulled",
  "consumed",
  "reopened",
  "verified",
  "failed",
  "joined",
] as const;
export type Kind = (typeof KINDS)[number];

export type NotifyEnv = MailEnv & { DB: D1Database };

/**
 * What a person is called wherever the product names them: the name they gave, else their handle,
 * else the account id — which is ugly, and still a person rather than "someone".
 *
 * Here rather than in a module of its own because every test that reads a sentence imports this
 * file, and a value import of a sibling `.ts` is what Node's type stripping cannot resolve.
 */
export function displayName(a: {
  id: string;
  handle?: string | null;
  name?: string | null;
}): string {
  const name = (a.name || "").trim();
  if (name) return name;
  if (a.handle) return `@${a.handle}`;
  return `@${a.id}`;
}

export interface Event {
  /** Account being told. Ignored when it is the actor: nobody needs telling what they just did. */
  to: string;
  kind: Kind;
  guide_id?: string;
  /** Who did it. '' is an anonymous share-link reader. */
  actor_id?: string;
  team_id?: string;
  /** One line of context shown with the event. Currently a verdict's reason. */
  note?: string;
  /**
   * Optional mail for this event, run only the first time it happens. A repeat of the same event
   * coalesces into the existing row, and inboxes are the easiest thing to ruin.
   */
  mail?: () => Promise<boolean>;
}

export interface Row {
  id: number;
  kind: Kind;
  guide_id: string;
  actor_id: string;
  team_id: string;
  at: string;
  times: number;
  read_at: string;
  note: string;
  title: string;
  /** The actor's handle. '' for an anonymous reader, and for an account that never chose one. */
  actor: string;
  /** The actor's own name, as they typed it. Read through `displayName`, never shown raw. */
  actor_real: string;
  /** The team's slug, and its name. */
  team: string;
  team_name: string;
}

/** Record one event and, if it is new, deliver it. Never throws; callers are on the write path. */
export async function notify(env: NotifyEnv, e: Event): Promise<void> {
  if (!e.to || e.to === e.actor_id) return;
  const at = new Date().toISOString();
  try {
    const row = await env.DB.prepare(
      `INSERT INTO notification (account_id, kind, guide_id, actor_id, team_id, at, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, kind, guide_id, actor_id)
         DO UPDATE SET at = excluded.at, times = notification.times + 1, note = excluded.note
       RETURNING id, times, emailed_at`,
    )
      .bind(e.to, e.kind, e.guide_id || "", e.actor_id || "", e.team_id || "", at, e.note || "")
      .first<{ id: number; times: number; emailed_at: string }>();
    if (!row || !e.mail || row.times !== 1 || row.emailed_at) return;
    if (await e.mail()) {
      await env.DB.prepare("UPDATE notification SET emailed_at = ? WHERE id = ?")
        .bind(at, row.id)
        .run();
    }
  } catch (err) {
    // A notification is never worth failing the action that caused it.
    console.error("notify", e.kind, (err as Error).message);
  }
}

/**
 * The events a team channel wants. Not all seven.
 *
 * A channel is a room full of people, so the bar is "everyone here would want to know", not
 * "someone here might". `pulled` and `consumed` are one person's progress on their own work, and a
 * room told about every pull learns to ignore the room.
 */
// A decline is here for the same reason a failed verdict is: it is work that has stopped moving
// and somebody in the room has to pick it up. `taken` rides along because a team watching a
// channel wants "who has this" answered where they are already looking.
const ANNOUNCED = new Set<Kind>(["shared", "handoff", "taken", "declined", "verified", "failed"]);

export interface Announcement {
  kind: Kind;
  team_id: string;
  /** The sentence, already rendered — the same one the feed, the CLI and the hub show. */
  text: string;
  /** The guide's share link, when the event is about one. */
  url?: string;
  /** The guide's title, for a room that can render a card rather than a line. */
  title?: string;
  /** Somebody's own words, when the event carries any. */
  note?: string;
}

/**
 * Whether a URL is one this server is willing to POST to.
 *
 * https only, and no credentials in the address. The Worker is what makes this request, so the URL
 * is a small instruction to fetch something on the team's behalf: `http` would put the channel's
 * secret address on the wire in clear, and a userinfo section is a way to smuggle a credential
 * somewhere it will be logged.
 *
 * Not an allowlist of Slack and Discord. Anything that accepts a POST works, and refusing the rest
 * would only push people into building a relay.
 */
export function webhookAllowed(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  return url.length <= 500;
}

/**
 * The body a given channel will accept.
 *
 * This started as one payload carrying `text` and `content` together, on the reasoning that Slack
 * reads the first, Discord the second, and each ignores what it does not recognise. That holds for
 * those two and breaks on Google Chat: its webhook is a Google API endpoint, and Google API
 * endpoints reject unknown field names outright rather than ignoring them — `Invalid JSON payload
 * received. Unknown name "content"`. A payload that is merely tolerated by two services is not a
 * format; it is a coincidence.
 *
 * So the host decides, and an address we do not recognise gets both spellings, which is the same
 * gamble as before but only where there is nothing better to go on.
 */
export function channelBody(url: string, text: string, facts?: CardFacts): Record<string, unknown> {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return { text, content: text };
  }
  if (host === "chat.googleapis.com") {
    // Chat is the one room that cannot preview a link on its own, so it is the one that gets the
    // card built for it. `text` stays: it is what a phone shows in the notification, and what the
    // message reads as where a card cannot render.
    const card = facts && chatCard(facts);
    return card ? { text, cardsV2: card } : { text };
  }
  if (host.endsWith("slack.com")) return { text };
  if (host === "discord.com" || host === "discordapp.com" || host.endsWith(".discord.com")) {
    return { content: text };
  }
  return { text, content: text };
}

// ---- the card a Google Chat room gets ---------------------------------------------------
//
// Chat does not unfurl a link the way Slack does: previews there come from a Chat app that
// registers URL patterns and answers a message event, and what a team connects here is an incoming
// webhook — so nothing on the other end ever reads the page's `og:` tags. And nothing should: the
// share key in a guide's URL *is* its authorisation, `robots.txt` disallows `/g/` for exactly that
// reason, and an unfurl means handing that key to somebody else's fetcher to cache.
//
// So the card is built from what we already know rather than scraped from a page nobody is allowed
// to read. No image either — the room's avatar is already the mark, and the only image worth adding
// would be the one that leaks the key.
//
// It lives here for the same reason `line()` does: one place decides how an event reads, whichever
// surface is showing it. (It also cannot live next door — this module is imported by two test
// files, and a value import of a sibling `.ts` is what Node's type stripping cannot resolve.)

export interface CardFacts {
  kind: string;
  /** The sentence every other surface shows, used as the card's subtitle. */
  text: string;
  /** The guide's title. The card's headline, when the event is about a guide. */
  title?: string;
  /** Somebody's own words — a verdict's reason, a decline's. Never paraphrased. */
  note?: string;
  url?: string;
}

/** Chat renders a small HTML subset in card text, so anything a person typed is escaped first. */
export function escChat(s: unknown): string {
  return String(s ?? "").replace(/[&<>]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt" }[c]};`);
}

/**
 * What kind of news this is, as the button's colour. The hub's semantic tokens, converted —
 * Chat takes floats, not hex.
 */
/**
 * The field names are Google's `google.type.Color`, spelled out: `red`, `green`, `blue`, `alpha`.
 *
 * They were `r`, `g`, `b` for a day, which Chat answered with a flat 400 on every post — a payload
 * carrying a field it does not know is refused whole, and a refused post is a silent one, so the
 * room simply went quiet. Nothing in a name like `r` says which API it belongs to; nothing in a
 * 400 says which field was wrong. That is what the response body below is now recorded for.
 */
type Color = { red: number; green: number; blue: number; alpha: number };
const tone = (red: number, green: number, blue: number): Color => ({ red, green, blue, alpha: 1 });

const TONES: Record<string, Color> = {
  // #ab2f21 — someone tried it and it does not hold up.
  failed: tone(0.671, 0.184, 0.129),
  // #8a5a08 — handed back, so it has stopped moving and only its author can restart it.
  declined: tone(0.541, 0.353, 0.031),
  // #3f6b45 — it worked, or somebody has it.
  verified: tone(0.247, 0.42, 0.271),
  taken: tone(0.247, 0.42, 0.271),
};
/** #b5451b, the brand. Everything that is neither good news nor bad. */
const BRAND = tone(0.71, 0.271, 0.106);

const MAX_TITLE = 120;

/** A guide title is a line, not a paragraph, and a card header does not wrap generously. */
function clip(s: string, max = MAX_TITLE): string {
  const one = s.trim().replace(/\s+/g, " ");
  if (one.length <= max) return one;
  const cut = one.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

type Widget = Record<string, unknown>;

/**
 * One card, or null when there is nothing to build one from.
 *
 * Null rather than an empty card on purpose: an event with no guide behind it (somebody joining a
 * team) is a sentence, and a sentence in a card with no title and no button is a worse sentence.
 */
export function chatCard(a: CardFacts): Record<string, unknown>[] | null {
  if (!a.title) return null;
  const widgets: Widget[] = [];
  if (a.note) {
    widgets.push({ textParagraph: { text: `<i>${escChat(clip(a.note, 280))}</i>` } });
  }
  if (a.url) {
    widgets.push({
      buttonList: {
        buttons: [
          {
            text: "Open the guide",
            onClick: { openLink: { url: a.url } },
            color: TONES[a.kind] ?? BRAND,
          },
        ],
      },
    });
  }
  // A card with a header and nothing under it is a heading pretending to be a card.
  if (!widgets.length) return null;
  return [
    {
      cardId: `passalong-${a.kind}`,
      card: {
        header: { title: escChat(clip(a.title)), subtitle: escChat(clip(a.text, 200)) },
        sections: [{ widgets }],
      },
    },
  ];
}

/** Whether this room renders the card, and so does not need the URL spelled out under the line. */
const cards = (url: string) => {
  try {
    return new URL(url).hostname === "chat.googleapis.com";
  } catch {
    return false;
  }
};

/**
 * Post one event to a team's channel, once.
 *
 * Separate from `notify()` on purpose: that is per recipient, and a team-wide share calls it once
 * per member. A channel told the same thing four times is a channel nobody reads.
 */
/** How many channels one team's event will fan out to. A bound, not a policy. */
const MAX_CHANNELS = 8;

export interface ChannelRow {
  id: string;
  url: string;
  failures: number;
}

/**
 * Post one line to one channel, and remember whether it worked.
 *
 * The remembering is the point: a webhook revoked on the other end fails silently forever,
 * because this is fire-and-forget by design. Recording the refusal is what lets the settings
 * screen say "this one has been failing" instead of a team slowly noticing the quiet.
 */
export async function post(
  env: NotifyEnv,
  channel: ChannelRow,
  text: string,
  facts?: CardFacts,
): Promise<{ ok: boolean; status: number; error: string }> {
  let status = 0;
  let error = "";
  try {
    const res = await fetch(channel.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(channelBody(channel.url, text, facts)),
      // A channel that has been deleted should not hold up the write that triggered this, and a
      // redirect to somewhere else is not somewhere this was meant to go.
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    status = res.status;
    if (!res.ok) {
      // The status alone is not a diagnosis. Chat answers a malformed card with a 400 that names
      // the offending field — "Cannot find field: r" — and throwing that away cost a day of a room
      // being quiet with `refused with 400` as the only evidence. It is read back into the hub, so
      // it is capped and it is the provider's own words rather than anything of ours.
      const said = await res.text().catch(() => "");
      error = said
        ? `refused with ${res.status}: ${said.replace(/\s+/g, " ").slice(0, 160)}`
        : `refused with ${res.status}`;
    }
  } catch (err) {
    error = (err as Error).message || "did not answer";
  }

  // Written only when the state changes, so a healthy channel costs no writes at all.
  try {
    if (error) {
      await env.DB.prepare(
        "UPDATE team_channel SET failures = failures + 1, last_error = ? WHERE id = ?",
      )
        .bind(error.slice(0, 200), channel.id)
        .run();
    } else if (channel.failures > 0) {
      await env.DB.prepare("UPDATE team_channel SET failures = 0, last_error = '' WHERE id = ?")
        .bind(channel.id)
        .run();
    }
  } catch {
    // Bookkeeping about a delivery is not worth failing over either.
  }
  return { ok: !error, status, error };
}

export async function announce(env: NotifyEnv, a: Announcement): Promise<void> {
  if (!ANNOUNCED.has(a.kind) || !a.team_id) return;
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, url, failures FROM team_channel WHERE team_id = ? ORDER BY created LIMIT ?",
    )
      .bind(a.team_id, MAX_CHANNELS)
      .all<ChannelRow>();
    if (!results.length) return;
    // The line a room without cards gets, link and all. A room that renders the card gets the
    // sentence alone, because the button is already the link and a naked URL under a card is the
    // thing the card was built to replace.
    const line = a.url ? `${a.text}\n${a.url}` : a.text;
    const facts: CardFacts = {
      kind: a.kind,
      text: a.text,
      title: a.title,
      note: a.note,
      url: a.url,
    };
    const sent = await Promise.all(
      results.map((channel) => post(env, channel, cards(channel.url) ? a.text : line, facts)),
    );
    for (const [i, result] of sent.entries()) {
      if (!result.ok) console.error("announce", a.kind, results[i]?.id, result.error);
    }
  } catch (err) {
    // Same rule as a notification: never worth failing the action that caused it.
    console.error("announce", a.kind, (err as Error).message);
  }
}

/** Tell several people about the same thing (a team-wide share). */
export async function notifyAll(env: NotifyEnv, tos: string[], e: Omit<Event, "to">) {
  for (const to of tos) await notify(env, { ...e, to });
}

const FEED_SQL = `SELECT n.id, n.kind, n.guide_id, n.actor_id, n.team_id, n.at, n.times, n.read_at, n.note,
         COALESCE(g.title, '') AS title, COALESCE(a.handle, '') AS actor,
         COALESCE(a.name, '') AS actor_real, COALESCE(t.slug, '') AS team,
         COALESCE(t.name, '') AS team_name
  FROM notification n
  LEFT JOIN guide g ON g.id = n.guide_id
  LEFT JOIN account a ON a.id = n.actor_id
  LEFT JOIN team t ON t.id = n.team_id
  WHERE n.account_id = ?`;

export async function feed(
  env: NotifyEnv,
  account: string,
  { unread = false, limit = 50 } = {},
): Promise<Row[]> {
  const { results } = await env.DB.prepare(
    `${FEED_SQL}${unread ? " AND n.read_at = ''" : ""} ORDER BY n.at DESC LIMIT ?`,
  )
    .bind(account, Math.min(Math.max(limit, 1), 200))
    .all<Row>();
  return results;
}

export async function unreadCount(env: NotifyEnv, account: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM notification WHERE account_id = ? AND read_at = ''",
  )
    .bind(account)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Mark ids read, or everything unread when no ids are given. Returns how many changed. */
export async function markRead(env: NotifyEnv, account: string, ids?: number[]): Promise<number> {
  const at = new Date().toISOString();
  const stmt = ids?.length
    ? env.DB.prepare(
        `UPDATE notification SET read_at = ? WHERE account_id = ? AND read_at = ''
         AND id IN (${ids.map(() => "?").join(",")})`,
      ).bind(at, account, ...ids)
    : env.DB.prepare(
        "UPDATE notification SET read_at = ? WHERE account_id = ? AND read_at = ''",
      ).bind(at, account);
  const { meta } = await stmt.run();
  return meta.changes ?? 0;
}

export interface LineFacts {
  kind: Kind;
  title: string;
  times: number;
  note?: string;
  /** Who did it, already a display name. When absent it is worked out from the three below. */
  actor_name?: string;
  actor_id?: string;
  /** Handle. */
  actor?: string;
  actor_real?: string;
  /** Team slug, and its name — the name wins. */
  team?: string;
  team_name?: string;
  /**
   * Who a guide was sent to, by name. Set only for a room: a channel is read by everyone in it, so
   * a handoff posted there says who it went to rather than "you".
   */
  to?: string;
}

/**
 * The single sentence a notification reads as. Every surface shows this string.
 *
 * One vocabulary, the same everywhere a person reads about a guide: sent, opened, taking, passed
 * on, worked or didn't work, done with. A person is their display name, a team is its name, and
 * "Someone" is kept for the one actor who has no account at all — an anonymous share-link reader.
 */
export function line(r: LineFacts): string {
  const who =
    r.actor_name ||
    (r.actor_id || r.actor
      ? displayName({ id: r.actor_id || "", handle: r.actor, name: r.actor_real })
      : "Someone");
  const title = r.title ? `"${r.title}"` : "a guide";
  const team = r.team_name || r.team || "";
  const note = r.note ? `: ${r.note}` : "";
  switch (r.kind) {
    case "handoff":
      return r.to
        ? `${who} sent ${title} to ${r.to}${team ? ` in ${team}` : ""}`
        : `${who} sent you ${title}${team ? ` in ${team}` : ""}`;
    case "shared":
      return `${who} shared ${title} with ${team || "your team"}`;
    case "taken":
      return `${who} is taking ${title}${note}`;
    case "declined":
      return `${who} passed on ${title}${note}`;
    case "pulled":
      return `${who} opened ${title}${r.times > 1 ? ` ${r.times} times` : ""}`;
    case "consumed":
      return `${who} is done with ${title}`;
    case "reopened":
      return `${who} put ${title} back on your list`;
    case "verified":
      return `${who} said ${title} worked${note}`;
    case "failed":
      return `${who} said ${title} didn't work${note}`;
    case "joined":
      return `${who} joined ${team || "your team"}`;
    default:
      return `${who} did something with ${title}`;
  }
}

/** The actor as a person reads them. '' only for an anonymous share-link reader. */
const actorName = (r: Pick<Row, "actor_id" | "actor" | "actor_real">) =>
  r.actor_id ? displayName({ id: r.actor_id, handle: r.actor, name: r.actor_real }) : "";

export const summary = (r: Row) => ({
  id: r.id,
  kind: r.kind,
  guide: r.guide_id,
  actor: r.actor,
  actor_name: actorName(r),
  team: r.team,
  team_name: r.team_name || "",
  title: r.title,
  at: r.at,
  times: r.times,
  note: r.note,
  read: Boolean(r.read_at),
  text: line(r),
});
