// Stamps a fresh nonce on every inline <script> the renderer emits, and names that nonce in the
// page's Content-Security-Policy.
//
// Why this is a plugin and not a route rule: a route rule's headers are a constant, and a nonce
// that is constant is a nonce that is worthless. The header has to be written per response, next
// to the markup it describes.
//
// It only acts when it actually finds an inline script, so a `noScripts` route — a guide page,
// the landing — keeps the stricter header its route rule already set and never sees a nonce it
// has no use for. That also means this needs no list of routes to keep in step with nuxt.config:
// whether a page runs script is decided by whether one is there.
import { hubHeaders } from "../../shared/csp";

/** A 128-bit nonce, base64. Fresh per response, and never reused across requests. */
function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("render:html", (html, { event }) => {
    const nonce = makeNonce();
    let stamped = false;

    // Every `<script` the renderer wrote, including the JSON payload block. Tagging an external
    // <script src> too is harmless and keeps this from having to reason about which is which.
    const stamp = (chunk: string) =>
      chunk.replace(/<script(?![^>]*\bnonce=)/g, () => {
        stamped = true;
        return `<script nonce="${nonce}"`;
      });

    for (const part of ["head", "bodyPrepend", "bodyAppend"] as const) {
      html[part] = html[part].map(stamp);
    }

    if (!stamped) return;
    for (const [name, value] of Object.entries(hubHeaders(nonce, import.meta.dev))) {
      setHeader(event, name, value);
    }
  });
});
