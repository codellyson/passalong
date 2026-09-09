/**
 * The HTML half of transactional mail.
 *
 * Mail is not the web and the constraints are not the web's: no flexbox or grid, no external
 * stylesheet (Gmail keeps `<style>` in the head but several clients do not), no web fonts, and no
 * SVG — so this is tables, inline styles, and a system font stack. Every mail is also sent as
 * plain text, which is the version that always renders; this is the one that looks like the
 * product.
 *
 * Light on purpose, and every colour stated. Gmail on Android inverts a mail it decides is light
 * rather than honouring `prefers-color-scheme`, so a palette that relies on a default background
 * is a palette that arrives as something else. The tokens are the hub's own, written out because
 * a mail cannot read a stylesheet.
 */

const C = {
  bg: "#fbfaf7",
  card: "#ffffff",
  fg: "#1c1b19",
  muted: "#6b6862",
  line: "#e4e0d8",
  accent: "#b5451b",
  accentFg: "#fffaf7",
  accentSoft: "#f7e7de",
  code: "#f4f2ec",
  danger: "#ab2f21",
  warn: "#8a5a08",
  ok: "#3f6b45",
} as const;

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

/** Guide titles and verdict notes are somebody's typing, and they are going into markup. */
export function esc(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string,
  );
}

/** A paragraph of prose. */
export const p = (html: string, color: string = C.fg) =>
  `<p style="margin:0 0 14px;font:400 15px/1.6 ${SANS};color:${color};">${html}</p>`;

/** Bold, in the body colour: for a name or a title inside a sentence. */
export const b = (text: string) => `<b style="font-weight:600;color:${C.fg};">${esc(text)}</b>`;

/**
 * The one thing to do. A padded anchor rather than a table-and-VML button: Outlook's desktop
 * renderer squares the corners and nothing else breaks, which is a fair trade for markup a person
 * can still read.
 */
export const button = (label: string, href: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">` +
  `<tr><td style="border-radius:6px;background:${C.accent};">` +
  `<a href="${esc(href)}" style="display:inline-block;padding:11px 20px;border-radius:6px;` +
  `font:600 15px/1 ${SANS};color:${C.accentFg};text-decoration:none;">${esc(label)}</a>` +
  `</td></tr></table>`;

/**
 * A command to run, with its own label. Selectable text rather than a picture of a terminal:
 * the whole point of it is that somebody copies it.
 */
export const command = (label: string, cmd: string) =>
  `<p style="margin:0 0 6px;font:600 12px/1.4 ${SANS};letter-spacing:.04em;` +
  `text-transform:uppercase;color:${C.muted};">${esc(label)}</p>` +
  `<div style="margin:0 0 16px;padding:10px 12px;border:1px solid ${C.line};border-radius:6px;` +
  `background:${C.code};font:400 14px/1.5 ${MONO};color:${C.fg};word-break:break-all;">` +
  `${esc(cmd)}</div>`;

/** Somebody's own words — a verdict's reason, a decline's. Set apart, never paraphrased. */
export const quote = (text: string, tone: keyof typeof C = "line") =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
  `style="margin:0 0 16px;"><tr>` +
  `<td width="3" style="background:${C[tone]};font-size:0;line-height:0;">&nbsp;</td>` +
  `<td style="padding:2px 0 2px 12px;font:400 15px/1.6 ${SANS};color:${C.fg};">${esc(text)}</td>` +
  `</tr></table>`;

/** The quiet line under everything: what this is, and why it arrived. */
export const footnote = (html: string) =>
  `<p style="margin:0 0 8px;font:400 13px/1.6 ${SANS};color:${C.muted};">${html}</p>`;

/** Something you type, inside a sentence. Monospace or it reads as prose and nobody copies it. */
export const mono = (text: string) =>
  `<span style="font:400 14px/1.5 ${MONO};color:${C.fg};white-space:nowrap;">${esc(text)}</span>`;

/** A link inside prose, in the accent. */
export const link = (label: string, href: string) =>
  `<a href="${esc(href)}" style="color:${C.accent};text-decoration:underline;">${esc(label)}</a>`;

/**
 * Where the mark is served from. Absolute, because a mail has no page to be relative to.
 *
 * Gmail and Outlook block remote images by default for a sender nobody has replied to, so the
 * wordmark stays beside it as text and the `alt` carries the name. With images off the masthead
 * still reads; with them on it is the product's own mark rather than a coloured rectangle.
 */
const MARK = "/icon-192.png";
const HOME = "https://passalong.dev";

export interface Layout {
  /** The grey line beside the subject in an inbox list. Written, not inherited from the body. */
  preview: string;
  /** What happened, as a heading. Usually the guide's title. */
  heading: string;
  /** One line above the heading: who did it, and where. */
  eyebrow?: string;
  /** The stripe down the card, the way a row wears its state in the hub. */
  tone?: "accent" | "danger" | "warn" | "ok";
  body: string[];
  foot?: string[];
  /** The serving host, for the mark and the masthead link. Both have to be absolute in a mail. */
  origin?: string;
}

/**
 * The shell every mail is poured into: a masthead, one card, a footer.
 *
 * The card carries a coloured stripe down its left edge for the same reason a row in the hub does
 * — it is the one mark that says what kind of news this is before a word is read.
 */
export function shell(o: Layout): string {
  const tone = C[o.tone ?? "accent"];
  const home = (o.origin || HOME).replace(/\/$/, "");
  const body = o.body.join("");
  const foot = (o.foot ?? []).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(o.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preview)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.bg};">
<tr><td align="center" style="padding:28px 16px 40px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">

<tr><td style="padding:0 0 16px;">
  <a href="${esc(home)}" style="text-decoration:none;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="vertical-align:middle;line-height:0;">
      <img src="${esc(home)}${MARK}" width="26" height="26" alt="Passalong"
           style="display:block;width:26px;height:26px;border:0;border-radius:6px;">
    </td>
    <td style="padding-left:9px;vertical-align:middle;font:700 13px/1 ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${C.fg};">Passalong</td>
  </tr></table></a>
</td></tr>

<tr><td>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="background:${C.card};border:1px solid ${C.line};border-radius:10px;">
  <tr>
    <td width="4" style="background:${tone};font-size:0;line-height:0;border-radius:10px 0 0 10px;">&nbsp;</td>
    <td style="padding:24px 24px 20px;">
      ${
        o.eyebrow
          ? `<p style="margin:0 0 8px;font:600 12px/1.4 ${SANS};letter-spacing:.06em;text-transform:uppercase;color:${tone};">${esc(o.eyebrow)}</p>`
          : ""
      }
      <h1 style="margin:0 0 16px;font:600 22px/1.3 ${SANS};color:${C.fg};">${esc(o.heading)}</h1>
      ${body}
    </td>
  </tr></table>
</td></tr>

<tr><td style="padding:20px 4px 0;">
  ${foot}
  <p style="margin:0;font:400 13px/1.6 ${SANS};color:${C.muted};">
    Passalong hands finished work between people and their agents: what the problem was, how it was
    solved, how to check it, and what to watch out for.
  </p>
</td></tr>

</table></td></tr></table></body></html>`;
}
