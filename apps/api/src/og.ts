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
// same reason. Satori cannot read woff2, so these are the .ttf pair; the stylesheet's variable
// woff2 stays the thing browsers download.
import type { Meta } from "./guide.js";

type Env = { ASSETS: Fetcher };

type Font = { name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" };

// One fetch per isolate, not per request.
let FONTS: Promise<Font[]> | null = null;

function loadFonts(env: Env, base: string): Promise<Font[]> {
  if (!FONTS) {
    FONTS = Promise.all(
      ([400, 600] as const).map(async (weight) => {
        const res = await env.ASSETS.fetch(new URL(`/fonts/instrument-sans-${weight}.ttf`, base));
        if (!res.ok) throw new Error(`font ${weight}: ${res.status}`);
        return {
          name: "Instrument Sans",
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
  bg: "#fbfaf7",
  fg: "#1c1b19",
  muted: "#6b6862",
  line: "#e4e0d8",
  accent: "#b5451b",
  soft: "#f7e7de",
};

/** The card markup. Satori supports a flexbox subset, so every container declares display. */
function card(o: { title: string; id: string; meta: Meta }): string {
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
<div style="display:flex;flex-direction:column;justify-content:space-between;width:1200px;height:630px;background:${C.bg};padding:72px;font-family:'Instrument Sans';">
  <div style="display:flex;flex-direction:column;">
    <div style="display:flex;align-items:center;">
      <div style="display:flex;width:44px;height:44px;border-radius:10px;background:${C.accent};margin-right:18px;"></div>
      <div style="display:flex;color:${C.accent};font-size:26px;font-weight:600;letter-spacing:4px;">PASSALONG</div>
    </div>
    <div style="display:flex;color:${C.fg};font-size:66px;font-weight:600;line-height:1.1;letter-spacing:-2px;margin-top:44px;">${esc(clip(o.title, 90))}</div>
  </div>
  <div style="display:flex;flex-direction:column;">
    <div style="display:flex;margin-bottom:28px;">${bits.map(chip).join("")}</div>
    <div style="display:flex;align-items:center;border-top:2px solid ${C.line};padding-top:26px;">
      <div style="display:flex;color:${C.muted};font-size:26px;">A transfer guide \u00a0·\u00a0 id ${esc(o.id)}</div>
    </div>
  </div>
</div>`;
}

/** PNG bytes for one guide's unfurl card, 1200×630. */
export async function renderOgImage(
  env: Env,
  base: string,
  g: { id: string; meta: Meta },
): Promise<Response> {
  // `workers-og` is workerd-only: its yoga and resvg wasm declare imports that only that runtime
  // supplies, so `import()` fails outright under Node with "Cannot find package 'a'" — a message
  // that says nothing about the cause. Nitro's `experimental.wasm` bundles both files for the
  // deployed Worker, so this route works there and cannot work under `nuxt dev`. To see a card
  // locally, build and serve the output on workerd:
  //
  //     pnpm --filter @passalong/web build
  //     npx wrangler dev .output/server/index.mjs --assets .output/public
  const [og, fonts] = await Promise.all([
    import("workers-og").catch((e) => {
      throw new Error(
        `unfurl renderer unavailable — workers-og needs workerd, not this runtime (${(e as Error).message})`,
      );
    }),
    loadFonts(env, base),
  ]);
  const { ImageResponse } = og;
  const img = new ImageResponse(card({ title: g.meta.title || g.id, id: g.id, meta: g.meta }), {
    width: 1200,
    height: 630,
    format: "png",
    fonts,
  });
  // Crawlers refetch these often and a guide's card only changes when the guide does.
  return new Response(img.body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600, s-maxage=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
