// The web surface: every page a person looks at. The Worker in apps/api keeps the machine-facing
// half (`/v1/*`, the raw `.md` of a guide, its OG card) and, for now, deploys separately — phase 4
// mounts it here so there is one origin and one deploy again.

import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { VIEW_HEADERS } from "./shared/csp";

export default defineNuxtConfig({
  compatibilityDate: "2026-08-16",

  nitro: {
    preset: "cloudflare_module",

    // The mounted API renders each guide's unfurl card with `workers-og`, which is satori and
    // resvg compiled to wasm. Without this the bundler tries to parse the .wasm as JavaScript and
    // the build dies on the first byte. It stays behind the dynamic import it already had in
    // apps/api, so only /g/:id/:key/og.png pays for ~1.7MB on a cold start.
    //
    // That renderer also reads `public/fonts/instrument-sans-{400,600}.ttf` through the ASSETS
    // binding. Nothing else does — satori cannot read woff2, and the stylesheet loads the variable
    // woff2 — so the pair looks unused and is not. Deleting it returns 500 on every unfurl card.
    experimental: { wasm: true },
  },

  // The guide format is defined once, in apps/api/src/guide.ts, and mirrored from
  // packages/passalong/src/guide.js. Both halves of the product need it — apps/api still serves a
  // guide's raw `.md` and its OG card — so it is aliased across rather than copied, which would
  // make a third place to keep in step. Both aliased modules are leaves with no imports of their
  // own; the cutover merges the two trees and the alias goes away.
  alias: {
    "#api": fileURLToPath(new URL("../api/src", import.meta.url)),
  },

  runtimeConfig: {
    // Where server/routes/v1/[...].ts forwards to while the two halves are still separate.
    // `NUXT_API_ORIGIN=http://localhost:8787` points a local Nuxt at a local `wrangler dev`.
    apiOrigin: "https://passalong.dev",
  },

  // The one stylesheet, unchanged from apps/api. Going through the build rather than sitting in
  // public/ gets it a content hash and an immutable cache header, which is what retires the
  // hand-bumped `STYLES = "/styles.css?v=15"` in apps/api/src/render.ts — a stale sheet once
  // shipped the hub unstyled to anyone who had visited before.
  // One entry, two sheets: tailwind.css imports styles.css into a cascade layer and adds the
  // utilities the board is built from. Loading them as two entries here instead would put the
  // product's stylesheet outside every layer, where it silently outranks all of them — see the
  // comment at the top of tailwind.css. The build hashes the result, so it stays one self-hosted
  // file that `style-src 'self'` allows.
  css: ["~/assets/css/tailwind.css"],

  vite: { plugins: [tailwindcss()] },

  experimental: {
    // Nuxt injects an inline <script type="importmap"> to resolve the entry chunk, and an
    // importmap is subject to script-src like any other inline script — under `script-src 'self'`
    // the browser refuses it and hydration then throws. Turning it off makes the entry a plain
    // external module, which `'self'` already allows.
    entryImportMap: false,
  },

  features: {
    // Nuxt inlines a page's CSS into the document by default. The view's CSP is `style-src 'self'`
    // — it refuses inline styles outright — so the stylesheet has to arrive as a <link>. This is
    // also why apps/api has exactly one stylesheet and no <style> attribute anywhere in it.
    inlineStyles: false,
  },

  app: {
    head: {
      htmlAttrs: { lang: "en" },
      // Everything `page()` in apps/api/src/render.ts puts on every document regardless of route.
      // Per-page title, description and unfurl live with the pages, in app/composables/usePage.ts.
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width,initial-scale=1" },
        { name: "theme-color", content: "#b5451b" },
        { property: "og:site_name", content: "Passalong" },
      ],
      link: [
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
        { rel: "icon", href: "/icon-192.png", type: "image/png", sizes: "192x192" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/site.webmanifest" },
      ],
    },
  },

  routeRules: {
    // Guide pages render markdown a stranger wrote, and the CSP is what makes that safe rather
    // than a sanitiser. `noScripts` drops the entry script, the import map, the inlined payload
    // and the JS resource hints, so the page can be served with no `script-src` at all. It also
    // means the route never hydrates: nothing on it may be interactive.
    //
    // The headers are `VIEW_HEADERS` from apps/api/src/index.ts, verbatim. They move here from
    // being a hand-spread object literal on every `c.html()` call.
    "/": { noScripts: true, headers: VIEW_HEADERS },
    // A guide page renders markdown a stranger wrote. There is no sanitiser behind this — the CSP
    // is what makes it safe, and `noScripts` is what lets the CSP name no `script-src` at all.
    "/g/**": { noScripts: true, headers: VIEW_HEADERS },

    // The hub, the invite page and the password reset run script, so their header is written per
    // response by server/plugins/csp.ts — it carries a nonce, which a route rule cannot.
    // Nothing to declare here.
  },

  devtools: { enabled: true },
});
