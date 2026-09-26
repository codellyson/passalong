// The unfurl card for a guide link.
//
// A guide travels by being pasted — into Slack, into a DM, into an agent's context — so the
// preview card is the first thing most people ever see of one. It used to be blank: the pages
// declared `twitter:card summary` and no image at all.
//
// Rendering happens through satori + resvg (workers-og), which is ~1.7MB of JavaScript and wasm.
// That is why it is imported dynamically inside the handler rather than at module scope: every
// other route on this Worker — the whole API — would otherwise pay to parse it on a cold start.
//
// Fonts come from `public/fonts` through the ASSETS binding rather than being bundled, for the
// same reason. Satori cannot read woff2, so these are the static .woff pair; the stylesheet's
// variable woff2 stays the thing browsers download.
import type { Meta } from "./guide.js";

type Env = { ASSETS: Fetcher };

type Font = { name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" };

// One fetch per isolate, not per request.
let FONTS: Promise<Font[]> | null = null;

function loadFonts(env: Env, base: string): Promise<Font[]> {
  if (!FONTS) {
    FONTS = Promise.all(
      ([400, 600] as const).map(async (weight) => {
        const res = await env.ASSETS.fetch(new URL(`/fonts/onest-${weight}.woff`, base));
        if (!res.ok) throw new Error(`font ${weight}: ${res.status}`);
        return {
          name: "Onest",
          data: await res.arrayBuffer(),
          weight,
          style: "normal" as const,
        };
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
// follows the *server's* colour scheme would be a coin flip. These match :root in styles.css.
const C = {
  bg: "#fffcfa",
  fg: "#252522",
  muted: "#6e6c68",
  line: "#efe6dc",
  accent: "#b5451b",
  soft: "#fce9e0",
};

/**
 * The mark, exactly as apps/web/public/favicon.svg draws it: a rust square with two offset cream
 * bars. Both cards used to draw only the square, which unfurled as a blank tile nobody recognised
 * as the logo. Satori renders an <img> whose source is a data URI without fetching anything, so the
 * SVG is inlined here. Keep it in step with favicon.svg.
 */
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${C.accent}"/><rect x="8" y="21" width="34" height="9" rx="4.5" fill="${C.bg}"/><rect x="22" y="34" width="34" height="9" rx="4.5" fill="${C.bg}" opacity=".85"/></svg>`;
const MARK = `<img src="data:image/svg+xml;base64,${btoa(MARK_SVG)}" width="44" height="44" style="margin-right:18px;" />`;

/** The card markup. Satori supports a flexbox subset, so every container declares display. */
function card(o: { title: string; from: string; meta: Meta }): string {
  const bits = [
    o.meta.status ? `${o.meta.status}` : "",
    o.meta.author ? `by ${o.meta.author}` : "",
    o.meta.stack_assumptions?.length
      ? `assumes ${clip(o.meta.stack_assumptions.join(", "), 46)}`
      : "",
  ].filter(Boolean);

  const chip = (t: string) =>
    `<div style="display:flex;background:${C.soft};color:${C.accent};font-size:24px;font-weight:600;padding:8px 18px;border-radius:999px;margin-right:12px;">${esc(t)}</div>`;

  return `
<div style="display:flex;flex-direction:column;justify-content:space-between;width:1200px;height:630px;background:${C.bg};padding:72px;font-family:'Onest';">
  <div style="display:flex;flex-direction:column;">
    <div style="display:flex;align-items:center;">
      ${MARK}
      <div style="display:flex;color:${C.accent};font-size:26px;font-weight:600;letter-spacing:4px;">PASSALONG</div>
    </div>
    <div style="display:flex;color:${C.fg};font-size:66px;font-weight:600;line-height:1.1;letter-spacing:-2px;margin-top:44px;">${esc(clip(o.title, 90))}</div>
  </div>
  <div style="display:flex;flex-direction:column;">
    <div style="display:flex;margin-bottom:28px;">${bits.map(chip).join("")}</div>
    <div style="display:flex;align-items:center;border-top:2px solid ${C.line};padding-top:26px;">
      <div style="display:flex;color:${C.muted};font-size:26px;">${o.from ? `From ${esc(clip(o.from, 60))}` : "A Passalong guide"}</div>
    </div>
  </div>
</div>`;
}

/**
 * The card for the site itself.
 *
 * `/` had no `og:image` at all, so every link to the product unfurled as a bare text row — the same
 * blank card the guide pages were fixed for, on the one page most people meet first. Same renderer
 * and same palette; what differs is that a guide's card leads with its title while this one leads
 * with the claim, because a link to `/` is not about any particular guide.
 */
function siteCard(): string {
  return `
<div style="display:flex;flex-direction:column;justify-content:space-between;width:1200px;height:630px;background:${C.bg};padding:72px;font-family:'Onest';">
  <div style="display:flex;align-items:center;">
    ${MARK}
    <div style="display:flex;color:${C.accent};font-size:26px;font-weight:600;letter-spacing:4px;">PASSALONG</div>
  </div>
  <div style="display:flex;flex-direction:column;">
    <div style="display:flex;color:${C.fg};font-size:62px;font-weight:600;line-height:1.12;letter-spacing:-2px;">Agents that never</div>
    <div style="display:flex;color:${C.accent};font-size:62px;font-weight:600;line-height:1.12;letter-spacing:-2px;margin-top:6px;">start from zero.</div>
  </div>
  <div style="display:flex;align-items:center;border-top:2px solid ${C.line};padding-top:26px;">
    <div style="display:flex;color:${C.muted};font-size:26px;">Queue work for your agents. Get back what they did, and why.</div>
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
async function renderCard(env: Env, base: string, markup: string): Promise<Response> {
  const [og, fonts] = await Promise.all([
    import("workers-og").catch((e) => {
      throw new Error(
        `unfurl renderer unavailable — workers-og needs workerd, not this runtime (${(e as Error).message})`,
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

/**
 * PNG bytes for one guide's unfurl card, 1200×630.
 *
 * `from` is the author as a person reads them. The footer used to print the guide's id, which is
 * the one thing on the card nobody looking at a preview can do anything with.
 */
export async function renderOgImage(
  env: Env,
  base: string,
  g: { id: string; meta: Meta; from?: string },
): Promise<Response> {
  return renderCard(
    env,
    base,
    card({ title: g.meta.title || g.id, from: g.from || "", meta: g.meta }),
  );
}

/** PNG bytes for the site's own unfurl card, 1200×630. */
export async function renderSiteOgImage(env: Env, base: string): Promise<Response> {
  return renderCard(env, base, siteCard());
}
