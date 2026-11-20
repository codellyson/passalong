// The unfurl card for a piece of work link.
//
// A piece of work travels by being pasted — into Slack, into a DM, into an agent's context — so the
// preview card is the first thing most people ever see of one. It used to be blank: the pages
// declared `twitter:card summary` and no image at all.
//
// Rendering happens through satori + resvg (workers-og), which is ~1.7MB of JavaScript and wasm.
// That is why it is imported dynamically inside the handler rather than at module scope: every
// other route on this Worker — the whole API — would otherwise pay to parse it on a cold start.
//
// Fonts come from `public/fonts` through the ASSETS binding rather than being bundled, for the
// same reason. Satori cannot read woff2 or a variable font, so these are static .woff instances cut
// from the stylesheet's variable woff2 (fontTools' instancer), with GPOS removed because Satori
// misapplies its kerning to the spaces between words: Geist for the words, as the hub
// draws them, and Newsreader for the site card's headline, as the landing draws it (DESIGN.md §2).
import type { Meta } from "./work.js";

type Env = { ASSETS: Fetcher };

type Font = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 600;
  style: "normal" | "italic";
};

const FACES: { file: string; name: string; weight: Font["weight"]; style: Font["style"] }[] = [
  { file: "geist-400.woff", name: "Geist", weight: 400, style: "normal" },
  { file: "geist-600.woff", name: "Geist", weight: 600, style: "normal" },
  { file: "newsreader-500.woff", name: "Newsreader", weight: 500, style: "normal" },
  { file: "newsreader-500-italic.woff", name: "Newsreader", weight: 500, style: "italic" },
];

// One fetch per isolate, not per request.
let FONTS: Promise<Font[]> | null = null;

function loadFonts(env: Env, base: string): Promise<Font[]> {
  if (!FONTS) {
    FONTS = Promise.all(
      FACES.map(async (f) => {
        const res = await env.ASSETS.fetch(new URL(`/fonts/${f.file}`, base));
        if (!res.ok) throw new Error(`font ${f.file}: ${res.status}`);
        return { name: f.name, data: await res.arrayBuffer(), weight: f.weight, style: f.style };
      }),
    ).catch((e) => {
      // A failed load must not poison the isolate for every later request.
      FONTS = null;
      throw e;
    });
  }
  return FONTS;
}

// Satori's HTML parser does not decode named entities — `&amp;` would render as those five
// characters — so text is stripped of the characters that could break out of an attribute or a
// tag rather than entity-escaped. Nothing here is interpreted as markup afterwards.
const esc = (s: string) =>
  s
    .replace(/[<>"'&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Satori has no line clamp worth relying on, so long strings are cut here instead. */
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

// Light palette only: unfurl cards are composited on someone else's background, and a card that
// follows the *server's* colour scheme would be a coin flip. These match DESIGN.md §1, light.
const C = {
  bg: "#ffffff",
  fg: "#252522",
  muted: "#6e6c68",
  line: "#ececea",
  accent: "#b8481f",
  surface: "#f4f4f3",
};

/**
 * The mark, exactly as apps/web/public/favicon.svg draws it: the rust squircle with the white P.
 * Satori renders an <img> whose source is a data URI without fetching anything, so the SVG is
 * inlined here. Keep it in step with favicon.svg; the card cache keys on the markup, so a change
 * here redraws every card.
 */
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 0C55.2 0 64 8.8 64 32S55.2 64 32 64 0 55.2 0 32 8.8 0 32 0Z" fill="#B5451B"/><path d="M20 47V18H34.5a9 9 0 0 1 0 18H32" fill="none" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** The mark and the name, as the hub's rail and the landing's header set them. */
const BRAND = `<div style="display:flex;align-items:center;">
    <img src="data:image/svg+xml;base64,${btoa(MARK_SVG)}" width="48" height="48" style="margin-right:16px;" />
    <div style="display:flex;color:${C.fg};font-size:32px;font-weight:600;letter-spacing:-0.5px;">Passalong</div>
  </div>`;

const FRAME = `display:flex;flex-direction:column;justify-content:space-between;width:1200px;height:630px;background:${C.bg};padding:72px;font-family:'Geist';`;

/** How a status reads to a person: the board's column names, never the stored word. */
const STATUS: Record<string, string> = { draft: "Draft", ready: "Ready", done: "Done" };

/** A chip as the hub draws one: recessed grey, ink words, 8px corners, never a pill (DESIGN.md §4). */
const chip = (t: string) =>
  `<div style="display:flex;background:${C.surface};color:${C.fg};font-size:24px;font-weight:600;padding:8px 16px;border-radius:8px;margin-left:12px;">${esc(t)}</div>`;

/**
 * The card markup. Satori supports a flexbox subset, so every container declares display. A piece
 * of work has two forms, and the card leads with both as the hub does: the title, then the summary a
 * person reads. The stack line went: it is a field no new work carries.
 */
function card(o: { title: string; from: string; meta: Meta }): string {
  const chips = [STATUS[o.meta.status || ""] || "", o.meta.tags?.[0] || ""].filter(Boolean);
  const summary = String(o.meta.summary || "").trim();
  return `
<div style="${FRAME}">
  <div style="display:flex;flex-direction:column;">
    ${BRAND}
    <div style="display:flex;color:${C.fg};font-size:60px;font-weight:600;line-height:1.12;letter-spacing:-1.5px;margin-top:48px;">${esc(clip(o.title, 90))}</div>
    ${summary ? `<div style="display:flex;color:${C.muted};font-size:28px;line-height:1.4;margin-top:20px;">${esc(clip(summary, 150))}</div>` : ""}
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid ${C.line};padding-top:24px;">
    <div style="display:flex;color:${C.muted};font-size:26px;">${o.from ? `From ${esc(clip(o.from, 50))}` : "Work on Passalong"}</div>
    <div style="display:flex;">${chips.map(chip).join("")}</div>
  </div>
</div>`;
}

/**
 * The card for the site itself, in the landing's words and look: its title as the headline, set in
 * the serif with the second half in coral italic as the landing's headings are, and its hero line
 * under the rule. A link to `/` is not about any particular work, so it leads with the claim.
 */
function siteCard(): string {
  return `
<div style="${FRAME}">
  ${BRAND}
  <div style="display:flex;flex-direction:column;font-family:'Newsreader';font-weight:500;font-size:76px;line-height:1.06;letter-spacing:-1.5px;">
    <div style="display:flex;color:${C.fg};">Your agents handle every</div>
    <div style="display:flex;color:${C.accent};font-style:italic;">request your team sends.</div>
  </div>
  <div style="display:flex;border-top:1px solid ${C.line};padding-top:24px;">
    <div style="display:flex;color:${C.muted};font-size:28px;line-height:1.4;">Bugs, emails and alerts land in one place. Your agent takes each one and comes back with proof.</div>
  </div>
</div>`;
}

/**
 * Markup to PNG bytes, once, for whichever card asked.
 *
 * `workers-og` is workerd-only: its yoga and resvg wasm declare imports that only that runtime
 * supplies, so `import()` fails outright under Node with "Cannot find package 'a'" — a message that
 * says nothing about the cause. Nitro's `experimental.wasm` bundles both files for the deployed
 * Worker, so this works there and cannot work under `nuxt dev`. To see a card locally, build and
 * serve the output on workerd:
 *
 *     pnpm --filter @passalong/web build
 *     npx wrangler dev .output/server/index.mjs --assets .output/public
 */
async function renderCard(
  env: Env,
  base: string,
  markup: string,
  later?: Later,
): Promise<Response> {
  // Satori makes a flex item of the whitespace between two tags, so a row of two spreads into four.
  const tight = markup.replace(/>\s+</g, "><").trim();
  return cached(base, tight, () => draw(env, base, tight), later);
}

async function draw(env: Env, base: string, markup: string): Promise<Response> {
  const [og, fonts] = await Promise.all([
    import("workers-og").catch((e) => {
      throw new Error(
        `unfurl renderer unavailable: workers-og needs workerd, not this runtime (${(e as Error).message})`,
      );
    }),
    loadFonts(env, base),
  ]);
  const { ImageResponse } = og;
  const img = new ImageResponse(markup, { width: 1200, height: 630, format: "png", fonts });
  // Crawlers refetch these often, and a card only changes when the thing behind it does.
  return new Response(img.body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600, s-maxage=86400",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Where a finished card is kept: the Worker's edge cache, or nowhere (`nuxt dev`, Node tests). */
export interface Cards {
  match(req: Request): Promise<Response | undefined>;
  put(req: Request, res: Response): Promise<void>;
}
/** `executionCtx.waitUntil`, so storing a card never holds up the response that carries it. */
export type Later = (p: Promise<unknown>) => void;

const edge = (): Cards | null =>
  (globalThis as { caches?: { default?: Cards } }).caches?.default ?? null;

/**
 * Bumped when the renderer changes in a way the markup cannot show — the fonts, the size, the
 * format. Everything else a card depends on is in the markup, so it is in the key already.
 */
const DRAWN_WITH =
  "geist-400,geist-600,newsreader-500,newsreader-500-italic.woff no-gpos 1200x630 png";

/**
 * A card is drawn once and then served from the edge cache.
 *
 * Every unfurl was a fresh render — a second or more of wasm on every crawler fetch — because a
 * response a Worker makes is never cached by Cloudflare's CDN, whatever its `cache-control` says;
 * only the Cache API stores it. The key is a hash of the markup, not the work's address: the card
 * is exactly its markup, so a retitled work, a status change or a renamed author is a new key and
 * never a stale picture, and nothing has to remember to purge. It also keeps the share key, which
 * is the work's secret, out of the cache key entirely. The key's path is never routed, so nothing
 * outside this function can read an entry.
 */
export async function cached(
  base: string,
  markup: string,
  render: () => Promise<Response>,
  later?: Later,
  cards: Cards | null = edge(),
): Promise<Response> {
  if (!cards) return render();
  const bytes = new TextEncoder().encode(`${DRAWN_WITH}\n${markup}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = [...digest.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = new Request(`${new URL(base).origin}/__og/${hex}.png`);
  const hit = await cards.match(key);
  if (hit) return hit;
  const res = await render();
  if (!res.ok) return res;
  const store = cards.put(key, res.clone()).catch(() => {});
  if (later) later(store);
  else await store;
  return res;
}

/**
 * PNG bytes for one piece of work's unfurl card, 1200×630.
 *
 * `from` is the author as a person reads them. The footer used to print the work's id, which is
 * the one thing on the card nobody looking at a preview can do anything with.
 */
export async function renderOgImage(
  env: Env,
  base: string,
  g: { id: string; meta: Meta; from?: string },
  later?: Later,
): Promise<Response> {
  return renderCard(
    env,
    base,
    card({ title: g.meta.title || g.id, from: g.from || "", meta: g.meta }),
    later,
  );
}

/** PNG bytes for the site's own unfurl card, 1200×630. */
export async function renderSiteOgImage(env: Env, base: string, later?: Later): Promise<Response> {
  return renderCard(env, base, siteCard(), later);
}
