// One piece of work as its page shows it, for the two ways in: its public link
// (api/work/[id]/[key].get.ts), where holding the key is the whole authorisation, and the signed-in
// read the hub frames (api/work/[id]/index.get.ts), where the session cookie is. Work is private
// until its author shares it (2026-11-22), so the public read must never hand out anything about
// work that was not shared, not even a title.
import type { H3Event } from "h3";
import { track } from "#api/analytics";
import { cachedPreview, previewOf, unfurlTarget } from "#api/unfurl";
import { body as bodyOf, parseMeta } from "#api/work";
import { db } from "./d1";
import { idsIn, type LinkPreview, renderBody, summarize, urlsIn } from "./work-html";

export const ID_RE = /^[a-z0-9]{6,12}$/;
export const KEY_RE = /^[a-z0-9]{16,32}$/;

export type WorkPageRow = {
  id: string;
  share_key: string;
  markdown: string;
  pulls: number;
  account_id: string;
  team_id: string;
  parent_id: string;
};
export const WORK_PAGE_COLUMNS = "id, share_key, markdown, pulls, account_id, team_id, parent_id";

/** 404 whatever the reason: whether work exists is what a refusal must not confirm. */
export const noSuchWork = () => createError({ statusCode: 404, statusMessage: "no such work" });

/**
 * The account behind the hub's session cookie, or "" — the same check as apps/api's middleware.
 * Cookie only: a frame cannot send a bearer token, and nothing else reads this.
 */
export async function sessionAccount(event: H3Event): Promise<string> {
  const sid = getCookie(event, "pa_session");
  if (!sid) return "";
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sid));
  const hash = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const row = await db(event)
    .prepare(
      `SELECT s.account_id FROM session s JOIN account a ON a.id = s.account_id
        WHERE s.hash = ? AND s.expires > ? AND COALESCE(a.suspended_at, '') = ''`,
    )
    .bind(hash, new Date().toISOString())
    .first<{ account_id: string }>();
  return row?.account_id || "";
}

export async function workPage(event: H3Event, row: WorkPageRow, opts: { public: boolean }) {
  /**
   * Work made from this one (`parent:`), and the work this came from. The links handed out must not
   * reach further than the work opened: one is listed only when it lives in the same team — or, for
   * work in no team, when the same author wrote it into no team — and, on the public page, only
   * when it was shared as well. Drafts reach nobody yet.
   */
  const sameRoom = `${row.team_id ? "team_id = ?" : "team_id = '' AND account_id = ?"}${opts.public ? " AND share_key <> ''" : ""}`;
  const roomValue = row.team_id || row.account_id;
  const origin = getRequestURL(event).origin;
  // The public page links only to other shared work, by its public link; the signed-in read links
  // to each one's hub page.
  const link = (g: { id: string; share_key: string }) =>
    opts.public ? `${origin}/w/${g.id}/${g.share_key}` : `${origin}/hub/w/${g.id}`;

  const { results: children } = await db(event)
    .prepare(
      `SELECT id, share_key, title, created FROM work
        WHERE parent_id = ? AND status <> 'draft' AND ${sameRoom}
        ORDER BY created ASC LIMIT 20`,
    )
    .bind(row.id, roomValue)
    .all<{ id: string; share_key: string; title: string; created: string }>();

  const parentRow = row.parent_id
    ? await db(event)
        .prepare(`SELECT id, share_key, title FROM work WHERE id = ? AND ${sameRoom}`)
        .bind(row.parent_id, roomValue)
        .first<{ id: string; share_key: string; title: string }>()
    : null;

  // Sent from here, never the browser. A share link carries its key in the URL and every web
  // analytics SDK reports the page URL, so a client-side integration would have posted users'
  // share keys to a third party — and loosening the CSP to load one would trade the product's one
  // real security property for a chart. Event names only, and nothing identifying goes near them.
  const env = (event.context.cloudflare as { env?: Record<string, string> } | undefined)?.env;
  if (env && opts.public) event.waitUntil(track(env, "work_viewed"));

  // Who sent it, by the name they go by here. The file's `author:` is the git name of whatever
  // machine wrote it, which said "from Isiaka Lukman" over work the hub says came from Wren
  // (2026-11-07); it is kept only for an account that has no name yet.
  const sender = await db(event)
    .prepare("SELECT name FROM account WHERE id = ?")
    .bind(row.account_id)
    .first<{ name: string }>();

  const body = bodyOf(row.markdown);
  // Work this names — an id written bare (`p64kbrdt`) or a link to its page — becomes a link with
  // its card, to the same reach as parent and children above: only work in the same room, never a
  // draft, and never this work itself. Its card says Ready or Done and nothing about who holds it,
  // as this page says nothing about who answered it.
  const named = idsIn(body).filter((n) => n !== row.id);
  const { results: mentioned } = named.length
    ? await db(event)
        .prepare(
          `SELECT w.id, w.share_key, w.title, w.summary, w.status, w.outcome
             FROM work w
            WHERE w.id IN (${named.map(() => "?").join(",")}) AND w.status <> 'draft' AND ${sameRoom.replace(/\b(team_id|account_id)\b/g, "w.$1")}`,
        )
        .bind(...named, roomValue)
        .all<{
          id: string;
          share_key: string;
          title: string;
          summary: string;
          status: string;
          outcome: string;
        }>()
    : { results: [] };
  const works = new Map(
    mentioned.map((g) => [
      g.id,
      {
        url: link(g),
        title: g.title,
        summary: g.summary,
        status: g.status,
        outcome: g.outcome,
      },
    ]),
  );
  // Other pages it links to get their preview card from what the hub's cards have already read
  // (the same cache as /v1/unfurl). This page never waits on another site: a link not read yet is
  // read after the answer, for the next person to open it.
  const here = getRequestURL(event);
  const own = [here.hostname];
  const previews = new Map<string, LinkPreview>();
  let reading = 0;
  await Promise.all(
    urlsIn(body)
      .filter((u) => unfurlTarget(u, own))
      .map(async (u) => {
        const hit = await cachedPreview(here.origin, u).catch(() => null);
        if (hit) previews.set(u, hit);
        else if (reading++ < 5) event.waitUntil(previewOf(here.origin, u, own).catch(() => {}));
      }),
  );
  const { html, outline } = renderBody(body, works, here.host, previews);
  return {
    id: row.id,
    meta: parseMeta(row.markdown),
    from: sender?.name?.trim() || "",
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
}
