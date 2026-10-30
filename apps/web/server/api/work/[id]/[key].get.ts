// One piece of work, by its id and its share key.
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
  // A malformed address is not found, not "bad request": whether work exists is exactly what
  // the key is meant to withhold, so both answers have to look the same.
  if (!ID_RE.test(id) || !KEY_RE.test(key)) {
    throw createError({ statusCode: 404, statusMessage: "no such work" });
  }

  const row = await db(event)
    .prepare(
      `SELECT id, share_key, markdown, pulls, account_id, team_id, parent_id
         FROM guide WHERE id = ? AND share_key = ?`,
    )
    .bind(id, key)
    .first<{
      id: string;
      share_key: string;
      markdown: string;
      pulls: number;
      account_id: string;
      team_id: string;
      parent_id: string;
    }>();

  if (!row) throw createError({ statusCode: 404, statusMessage: "no such work" });

  /**
   * Work made from this one (`parent:`), and the work this came from. Holding this key is the only
   * authorisation there is, so the links it hands out must not reach further than the work it
   * opens: one is listed only when it lives in the same team — or, for work in no team, when the
   * same author wrote it into no team. Drafts reach nobody yet.
   */
  const sameRoom = row.team_id ? "team_id = ?" : "team_id = '' AND account_id = ?";
  const roomValue = row.team_id || row.account_id;
  const origin = getRequestURL(event).origin;
  const link = (g: { id: string; share_key: string }) => `${origin}/g/${g.id}/${g.share_key}`;

  const { results: children } = await db(event)
    .prepare(
      `SELECT id, share_key, title, created FROM guide
        WHERE parent_id = ? AND status <> 'draft' AND ${sameRoom}
        ORDER BY created ASC LIMIT 20`,
    )
    .bind(row.id, roomValue)
    .all<{ id: string; share_key: string; title: string; created: string }>();

  const parentRow = row.parent_id
    ? await db(event)
        .prepare(`SELECT id, share_key, title FROM guide WHERE id = ? AND ${sameRoom}`)
        .bind(row.parent_id, roomValue)
        .first<{ id: string; share_key: string; title: string }>()
    : null;

  // Sent from here, never the browser. A share link carries its key in the URL and every web
  // analytics SDK reports the page URL, so a client-side integration would have posted users'
  // share keys to a third party — and loosening the CSP to load one would trade the product's one
  // real security property for a chart. Event names only, and nothing identifying goes near them.
  const env = (event.context.cloudflare as { env?: Record<string, string> } | undefined)?.env;
  if (env) event.waitUntil(track(env, "guide_viewed"));

  const body = bodyOf(row.markdown);
  const { html, outline } = renderBody(body);
  return {
    id: row.id,
    meta: parseMeta(row.markdown),
    html,
    outline,
    description: summarize(body),
    shareKey: row.share_key,
    pulls: row.pulls,
    children: (children ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      created: c.created,
      url: link(c),
    })),
    parent: parentRow ? { id: parentRow.id, title: parentRow.title, url: link(parentRow) } : null,
  };
});
