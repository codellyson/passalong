// One guide, by its id and its share key.
//
// The id is an address; the **key is the secret**, and holding it is the whole authorisation
// check — there is no account involved. This returns exactly what the share link already shows
// to whoever has it, so it is not a wider surface than the page it feeds.
import { track } from "#api/analytics";
import { body as bodyOf, parseMeta } from "#api/guide";
import { DOCK_MAX, parseWith } from "../../../../app/utils/dock";
import { db } from "../../../utils/d1";
import { renderBody, summarize } from "../../../utils/guide-html";

type Field = string | string[] | undefined;
const str = (v: Field) => (Array.isArray(v) ? v.join(", ") : v || "");

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

  if (!row) throw createError({ statusCode: 404, statusMessage: "no such guide" });

  /**
   * Follow-ups: more context written as guides of their own, linked under this one. A reader of the
   * original has to get them too, or the context never reaches the person doing the work.
   *
   * Holding this key is the only authorisation there is, so the links it hands out must not reach
   * further than the guide it opens. A follow-up is listed only when it lives in the same team as
   * this guide — or, for a guide in no team, when the same author wrote it into no team. A follow-up
   * published into a different team is never listed here, whoever wrote it. Drafts are not context
   * yet. The same rule decides whether the guide this one follows is linked.
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

  /**
   * The follow-ups docked beside this guide, from `?with=`. Only ids already listed above — the same
   * team rule, so an address cannot dock a guide the list would not show — and at most DOCK_MAX,
   * keeping the most recently opened. Columns are drawn in the order the follow-ups were added.
   *
   * Each is rendered by the same renderer as the guide. Its heading ids are prefixed with its own
   * id: every guide has a "problem" and a "steps", and side by side the contents links would jump
   * to whichever column happened to come first.
   */
  const listed = new Set((children ?? []).map((c) => c.id));
  // `?with=all` opens the first few without naming them. The hub links here that way: a row that
  // says a guide has three follow-ups could not name their ids, so the only thing it could link to
  // was a list of rows to click one at a time.
  const asked = getQuery(event).with;
  const all = String(Array.isArray(asked) ? asked[0] : (asked ?? "")).trim() === "all";
  const withIds = all
    ? (children ?? []).slice(0, DOCK_MAX).map((c) => c.id)
    : parseWith(asked, ID_RE)
        .filter((c) => listed.has(c))
        .slice(-DOCK_MAX);
  const dockedRows = withIds.length
    ? ((
        await db(event)
          .prepare(
            `SELECT id, share_key, title, created, markdown FROM guide
              WHERE parent_id = ? AND status <> 'draft' AND ${sameRoom}
                AND id IN (${withIds.map(() => "?").join(",")})
              ORDER BY created ASC`,
          )
          .bind(row.id, roomValue, ...withIds)
          .all<{
            id: string;
            share_key: string;
            title: string;
            created: string;
            markdown: string;
          }>()
      ).results ?? [])
    : [];
  const docked = dockedRows.map((d) => {
    const prefix = `f-${d.id}-`;
    const html = renderBody(bodyOf(d.markdown), "guide")
      .html.replace(/\bid="([^"]+)"/g, `id="${prefix}$1"`)
      .replace(/\bhref="#([^"]+)"/g, `href="#${prefix}$1"`);
    return {
      id: d.id,
      title: d.title,
      created: d.created,
      author: str(parseMeta(d.markdown).author as Field),
      url: link(d),
      html,
    };
  });

  const view = getQuery(event).view === "verify" ? "verify" : "guide";

  // Sent from here, never the browser. A share link carries its key in the URL and every web
  // analytics SDK reports the page URL, so a client-side integration would have posted users'
  // share keys to a third party — and loosening the CSP to load one would trade the product's one
  // real security property for a chart. Event names and categorical props only: `view` is one of
  // two literals, and nothing identifying goes near it.
  const env = (event.context.cloudflare as { env?: Record<string, string> } | undefined)?.env;
  if (env) event.waitUntil(track(env, "guide_viewed", { view }));

  /**
   * Standing verdicts that say this does not hold, and the report behind each.
   *
   * The page never showed a verdict at all, so a guide somebody had already found broken still
   * read as authoritative to the next person who opened it — and the only way to warn them was to
   * publish a second guide titled "Correction: …" and hope they followed the link.
   *
   * Nobody is named. The key in this URL is the whole authorisation, so the page is as public as
   * the link: an author put their own name in their own frontmatter, and a verifier did not put
   * theirs anywhere. What the next reader needs is that it did not hold and what was run — the
   * hub, which knows who is asking, names them.
   */
  const failing = (
    (
      await db(event)
        .prepare(
          `SELECT note, detail, checks, at FROM verdict
            WHERE guide_id = ? AND ok = 0 ORDER BY at DESC LIMIT 5`,
        )
        .bind(row.id)
        .all<{ note: string; detail: string; checks: string; at: string }>()
    ).results ?? []
  ).map((v) => ({
    at: v.at,
    note: v.note,
    detail: v.detail,
    checks: (() => {
      try {
        const rows = JSON.parse(v.checks || "[]");
        return Array.isArray(rows) ? rows.filter((r) => r?.check) : [];
      } catch {
        return [];
      }
    })(),
  }));

  /**
   * What people had to adapt to make this work where they ran it.
   *
   * The other half of the same hole the aside above fills. A hand-in that said it did not hold had
   * nowhere to put the report, so it became a guide titled "Correction: …". A hand-in that DID
   * hold, and found that step 4 needed MAIL_FROM and the bucket name on that codebase, had `ok`
   * (a boolean), `note` (280 characters) and `evidence` (what you ran) — so it became a guide too,
   * titled "The email step needs MAIL_FROM and the R2 bucket name", with an id and a share link
   * and an inbox row asking somebody to take it, when what it is is a paragraph about this guide.
   *
   * It is a separate query rather than one over both, so a guide with five write-ups can never
   * push a "this did not hold" off the list: the warning is the one thing that must always show.
   * Nobody is named here, for the reason the failing list names nobody — this page is as public as
   * its link, and the hub, which knows who is asking, is where people have names.
   */
  const adapted = (
    (
      await db(event)
        .prepare(
          `SELECT writeup, checks, at FROM verdict
            WHERE guide_id = ? AND ok = 1 AND (writeup <> '' OR checks <> '')
            ORDER BY at DESC LIMIT 5`,
        )
        .bind(row.id)
        .all<{ writeup: string; checks: string; at: string }>()
    ).results ?? []
  )
    .map((v) => {
      /**
       * What was run, kept apart from what was said about it.
       *
       * A check carrying `cmd` and an `exit` was executed by the runner before the hand-in was
       * allowed to land, and a non-zero exit refused it — the agent did not write that output and
       * could not have. A check with only `ran` is the agent's account of a command, and `writeup`
       * is prose. All three used to be one undifferentiated block of trust, with the prose at the
       * top of the page and the executed commands not on the page at all.
       */
      let rows: { check: string; ran: string; cmd?: string; exit?: number | null }[] = [];
      try {
        const parsed = JSON.parse(v.checks || "[]");
        if (Array.isArray(parsed)) rows = parsed.filter((r) => r?.check);
      } catch {
        rows = [];
      }
      const verified = (c: (typeof rows)[number]) =>
        Boolean(c.cmd) && (typeof c.exit === "number" || c.exit === null);
      return {
        at: v.at,
        writeup: v.writeup,
        ran: rows.filter(verified),
        said: rows.filter((c) => !verified(c)),
      };
    })
    // A hand-in that brought neither has nothing to show. It can still have happened — the page
    // is not a log — but an empty block under "somebody ran this" would say otherwise.
    .filter((v) => v.writeup || v.ran.length || v.said.length)
    // What a command printed outranks what an agent wrote about it, here and in the markup below.
    // Sorting by it means the reader meets the strongest thing on offer first, whichever hand-in
    // it came from, rather than the most recent prose.
    .sort((a, b) => b.ran.length - a.ran.length);

  const body = bodyOf(row.markdown);
  const { html, outline, rest, cut } = renderBody(body, view);
  return {
    adapted,
    failing,
    id: row.id,
    meta: parseMeta(row.markdown),
    html,
    outline,
    rest,
    cut,
    description: summarize(body),
    shareKey: row.share_key,
    pulls: row.pulls,
    view,
    followUps: (children ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      created: c.created,
      url: link(c),
    })),
    parent: parentRow ? { id: parentRow.id, title: parentRow.title, url: link(parentRow) } : null,
    /** In the order they were opened, so "open another" knows which one to let go of. */
    openOrder: withIds.filter((c) => docked.some((d) => d.id === c)),
    docked,
  };
});
