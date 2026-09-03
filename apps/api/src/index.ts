// Relay sync API + web view. A Hono app on a Worker with one D1 database.
//
//   POST   /v1/accounts               mint an account; the token is the account
//   GET    /v1/me                      who am I, how many guides
//   GET    /v1/guides?q=               list/search my guides (summaries)
//   PUT    /v1/guides/:id              upsert a guide (body: text/markdown)
//   GET    /v1/guides/:id              my guide as markdown
//   PATCH  /v1/guides/:id/status       { status }
//   DELETE /v1/guides/:id
//   GET    /g/:id/:key                 read-only web view (share link)
//   GET    /g/:id/:key.md              the same guide as raw markdown
//
// Static files (stylesheet, icons, robots.txt, 404 page) live in public/ and are served by the
// assets layer before this Worker runs; see wrangler.jsonc.
import { Hono } from "hono";
import { body as bodyOf, type Meta, parseMeta, STATUSES, setField } from "./guide.js";
import { renderGuide, renderHome } from "./render.js";

// Workers rate-limit binding (wrangler.jsonc `ratelimits`). Optional so local dev without it
// still works.
type RateLimiter = { limit(opts: { key: string }): Promise<{ success: boolean }> };

type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  ACCOUNT_LIMIT?: RateLimiter;
  FREE_SYNC_LIMIT: string;
  ENVIRONMENT: string;
};
type Vars = { account: string };

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

const ID_RE = /^[a-z0-9]{6,12}$/;
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function rand(length: number, alphabet = ALPHABET): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const err = (c: { json: (o: unknown, s: number) => Response }, status: number, message: string) =>
  c.json({ message }, status);

interface GuideRow {
  id: string;
  account_id: string;
  share_key: string;
  title: string;
  status: string;
  source_context: string;
  tags: string;
  stack: string;
  markdown: string;
  created: string;
  updated: string;
  pulls: number;
}

const shareUrl = (origin: string, row: Pick<GuideRow, "id" | "share_key">) =>
  `${origin}/g/${row.id}/${row.share_key}`;

function summary(origin: string, r: GuideRow) {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    created: r.created,
    updated: r.updated,
    source_context: r.source_context,
    tags: JSON.parse(r.tags) as string[],
    stack_assumptions: JSON.parse(r.stack) as string[],
    pulls: r.pulls,
    url: shareUrl(origin, r),
  };
}

// ---- auth -------------------------------------------------------------------------------

app.use("/v1/*", async (c, next) => {
  if (c.req.method === "POST" && c.req.path === "/v1/accounts") return next();
  const auth = c.req.header("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return err(c, 401, "missing bearer token — run `relay login`");
  const row = await c.env.DB.prepare("SELECT id FROM account WHERE token_hash = ?")
    .bind(await sha256(token))
    .first<{ id: string }>();
  if (!row)
    return err(
      c,
      401,
      "token not recognized — run `relay login` for a new account or paste a valid token",
    );
  c.set("account", row.id);
  await next();
});

app.post("/v1/accounts", async (c) => {
  if (c.env.ACCOUNT_LIMIT) {
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const { success } = await c.env.ACCOUNT_LIMIT.limit({ key: ip });
    if (!success)
      return err(c, 429, "too many accounts created from this address; try again in a minute");
  }
  const id = rand(10);
  const token = `rl_${rand(32, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}`;
  await c.env.DB.prepare("INSERT INTO account (id, token_hash, created) VALUES (?, ?, ?)")
    .bind(id, await sha256(token), new Date().toISOString())
    .run();
  return c.json({ account: id, token }, 201);
});

app.get("/v1/me", async (c) => {
  const account = c.get("account");
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM guide WHERE account_id = ?")
    .bind(account)
    .first<{ n: number }>();
  return c.json({ account, guides: n?.n ?? 0, limit: Number(c.env.FREE_SYNC_LIMIT) });
});

// ---- guides -----------------------------------------------------------------------------

app.get("/v1/guides", async (c) => {
  const account = c.get("account");
  const q = (c.req.query("q") || "").trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  let sql = "SELECT * FROM guide WHERE account_id = ?";
  const binds: unknown[] = [account];
  for (const t of terms) {
    sql +=
      " AND (lower(title) LIKE ? OR lower(tags) LIKE ? OR lower(stack) LIKE ? OR lower(source_context) LIKE ? OR lower(markdown) LIKE ?)";
    const like = `%${t}%`;
    binds.push(like, like, like, like, like);
  }
  sql += " ORDER BY created DESC LIMIT 200";
  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<GuideRow>();
  const origin = new URL(c.req.url).origin;
  return c.json({ guides: results.map((r) => summary(origin, r)) });
});

app.put("/v1/guides/:id", async (c) => {
  const account = c.get("account");
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return err(c, 400, "invalid guide id");
  let markdown = await c.req.text();
  if (!markdown.trim()) return err(c, 400, "empty body; send the guide as text/markdown");
  if (markdown.length > 512 * 1024) return err(c, 413, "guide is over 512KB");
  const meta: Meta = parseMeta(markdown);
  if (meta.id && meta.id !== id) return err(c, 400, "frontmatter id does not match the URL");
  if (!meta.title) return err(c, 400, "frontmatter needs a title");
  const status =
    meta.status && (STATUSES as readonly string[]).includes(meta.status)
      ? meta.status
      : "published";

  const existing = await c.env.DB.prepare(
    "SELECT id, account_id, share_key, created FROM guide WHERE id = ?",
  )
    .bind(id)
    .first<Pick<GuideRow, "id" | "account_id" | "share_key" | "created">>();
  if (existing && existing.account_id !== account)
    return err(c, 403, "that id belongs to another account");

  if (!existing) {
    const limit = Number(c.env.FREE_SYNC_LIMIT) || 25;
    const active = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM guide WHERE account_id = ? AND status IN ('published','promoted')",
    )
      .bind(account)
      .first<{ n: number }>();
    if ((active?.n ?? 0) >= limit) {
      return err(
        c,
        402,
        `free tier keeps ${limit} active synced guides; mark some consumed (relay done <id>) or remove them`,
      );
    }
  }

  const origin = new URL(c.req.url).origin;
  const share_key = existing?.share_key ?? rand(22);
  const url = shareUrl(origin, { id, share_key });
  markdown = setField(markdown, "url", url);
  if (!meta.id) markdown = setField(markdown, "id", id);
  const now = new Date().toISOString();
  const created = String(meta.created || existing?.created || now);

  await c.env.DB.prepare(
    `INSERT INTO guide (id, account_id, share_key, title, status, source_context, tags, stack, markdown, created, updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, status=excluded.status, source_context=excluded.source_context,
       tags=excluded.tags, stack=excluded.stack, markdown=excluded.markdown, updated=excluded.updated`,
  )
    .bind(
      id,
      account,
      share_key,
      meta.title,
      status,
      String(meta.source_context || ""),
      JSON.stringify(meta.tags),
      JSON.stringify(meta.stack_assumptions),
      markdown,
      created,
      now,
    )
    .run();
  return c.json({ id, url, status, created: !existing }, existing ? 200 : 201);
});

async function ownGuide(
  c: { env: Env; get: (k: "account") => string },
  id: string,
): Promise<GuideRow | null> {
  return c.env.DB.prepare("SELECT * FROM guide WHERE id = ? AND account_id = ?")
    .bind(id, c.get("account"))
    .first<GuideRow>();
}

app.get("/v1/guides/:id", async (c) => {
  const row = await ownGuide(c, c.req.param("id"));
  if (!row) return err(c, 404, "no such guide");
  await c.env.DB.prepare("UPDATE guide SET pulls = pulls + 1 WHERE id = ?").bind(row.id).run();
  return c.text(row.markdown, 200, { "content-type": "text/markdown; charset=utf-8" });
});

app.patch("/v1/guides/:id/status", async (c) => {
  const row = await ownGuide(c, c.req.param("id"));
  if (!row) return err(c, 404, "no such guide");
  const { status } = (await c.req.json().catch(() => ({}))) as { status?: string };
  if (!status || !(STATUSES as readonly string[]).includes(status))
    return err(c, 400, `status must be one of ${STATUSES.join(", ")}`);
  const markdown = setField(row.markdown, "status", status);
  await c.env.DB.prepare("UPDATE guide SET status = ?, markdown = ?, updated = ? WHERE id = ?")
    .bind(status, markdown, new Date().toISOString(), row.id)
    .run();
  return c.json({ id: row.id, status });
});

app.delete("/v1/guides/:id", async (c) => {
  const row = await ownGuide(c, c.req.param("id"));
  if (!row) return err(c, 404, "no such guide");
  await c.env.DB.prepare("DELETE FROM guide WHERE id = ?").bind(row.id).run();
  return c.json({ id: row.id, deleted: true });
});

// ---- share links ------------------------------------------------------------------------

async function shared(c: { env: Env }, id: string, key: string): Promise<GuideRow | null> {
  if (!ID_RE.test(id) || !/^[a-z0-9]{16,32}$/.test(key)) return null;
  return c.env.DB.prepare("SELECT * FROM guide WHERE id = ? AND share_key = ?")
    .bind(id, key)
    .first<GuideRow>();
}

// Guides are the owner's own markdown, but a share link is viewed by other people. The CSP
// turns anything script-shaped in that markdown inert instead of trusting a sanitizer. Styles
// come from /styles.css (a static asset), so inline styles are refused too.
const VIEW_HEADERS = {
  "content-security-policy":
    "default-src 'none'; style-src 'self'; img-src 'self' https: data:; manifest-src 'self'; base-uri 'none'; form-action 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

// The 404 page is a static asset, so unmatched routes hand it back with the right status.
async function notFoundPage(c: { env: Env; req: { url: string } }): Promise<Response> {
  const asset = await c.env.ASSETS.fetch(new URL("/404.html", c.req.url));
  return new Response(asset.body, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", ...VIEW_HEADERS },
  });
}

app.get("/g/:id/:key{.+\\.md}", async (c) => {
  const row = await shared(c, c.req.param("id"), c.req.param("key").replace(/\.md$/, ""));
  if (!row) return c.text("no such guide", 404);
  await c.env.DB.prepare("UPDATE guide SET pulls = pulls + 1 WHERE id = ?").bind(row.id).run();
  return c.text(row.markdown, 200, {
    "content-type": "text/markdown; charset=utf-8",
    ...VIEW_HEADERS,
  });
});

app.get("/g/:id/:key", async (c) => {
  const row = await shared(c, c.req.param("id"), c.req.param("key"));
  if (!row) return notFoundPage(c);
  const meta = parseMeta(row.markdown);
  const html = renderGuide({
    id: row.id,
    meta,
    body: bodyOf(row.markdown),
    url: shareUrl(new URL(c.req.url).origin, row),
    pulls: row.pulls,
  });
  return c.html(html, 200, VIEW_HEADERS);
});

app.get("/", (c) => c.html(renderHome(), 200, VIEW_HEADERS));
app.get("/health", (c) => c.json({ ok: true }));

app.notFound((c) =>
  c.req.path.startsWith("/v1/") ? err(c, 404, "no such route") : notFoundPage(c),
);

app.onError((e, c) => {
  console.error(e);
  return err(c, 500, "internal error");
});

export default app;
