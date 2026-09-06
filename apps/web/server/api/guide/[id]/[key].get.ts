// One guide, by its id and its share key.
//
// The id is an address; the **key is the secret**, and holding it is the whole authorisation
// check — there is no account involved. This returns exactly what the share link already shows
// to whoever has it, so it is not a wider surface than the page it feeds.
import { track } from "#api/analytics";
import { body as bodyOf, parseMeta } from "#api/guide";
import { db } from "../../../utils/d1";
import { renderBody, summarize } from "../../../utils/guide-html";

const ID_RE = /^[a-z0-9]{6,12}$/;
const KEY_RE = /^[a-z0-9]{16,32}$/;

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") || "";
  const key = getRouterParam(event, "key") || "";
  // A malformed address is not found, not "bad request": whether a guide exists is exactly what
  // the key is meant to withhold, so both answers have to look the same.
  if (!ID_RE.test(id) || !KEY_RE.test(key)) {
    throw createError({ statusCode: 404, statusMessage: "no such guide" });
  }

  const row = await db(event)
    .prepare("SELECT id, share_key, markdown, pulls FROM guide WHERE id = ? AND share_key = ?")
    .bind(id, key)
    .first<{ id: string; share_key: string; markdown: string; pulls: number }>();

  if (!row) throw createError({ statusCode: 404, statusMessage: "no such guide" });

  const view = getQuery(event).view === "verify" ? "verify" : "guide";

  // Sent from here, never the browser. A share link carries its key in the URL and every web
  // analytics SDK reports the page URL, so a client-side integration would have posted users'
  // share keys to a third party — and loosening the CSP to load one would trade the product's one
  // real security property for a chart. Event names and categorical props only: `view` is one of
  // two literals, and nothing identifying goes near it.
  const env = (event.context.cloudflare as { env?: Record<string, string> } | undefined)?.env;
  if (env) event.waitUntil(track(env, "guide_viewed", { view }));

  const body = bodyOf(row.markdown);
  const { html, outline } = renderBody(body, view);
  return {
    id: row.id,
    meta: parseMeta(row.markdown),
    html,
    outline,
    description: summarize(body),
    shareKey: row.share_key,
    pulls: row.pulls,
    view,
  };
});
