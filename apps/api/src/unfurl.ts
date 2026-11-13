// A link's preview: what the page at a URL says about itself in its Open Graph tags — its title,
// its description, its site — so the hub's hover card can say what a link is before anyone follows
// it (`GET /v1/unfurl?url=`).
//
// The server fetches, never the browser: the hub's policy lets it talk only to its own origin, and a
// browser fetching every link it hovers would tell each of those sites who was reading what. One
// fetch serves everyone, from the edge cache, and carries no cookie or credential of ours.
//
// It is a fetch of a URL somebody else wrote, so it is fenced: http(s) only, no credentials in the
// URL, default ports only, no names or literal addresses that mean this machine or a private
// network, never our own hosts (what we know about our own work we already know), every redirect
// checked again, a short timeout, and only the head of an HTML page read. Images are not taken: the
// hub may draw images from its own origin only, and an image a stranger's page names is theirs to
// track with.
//
// Imports no sibling, so test/unfurl.test.mjs can run it.

export interface Preview {
  title: string;
  description: string;
  site: string;
}

const OURS = new Set([
  "passalong.dev",
  "www.passalong.dev",
  "json.passalong.dev",
  "passalong.kreativekorna.com",
]);

/** An address on this machine or a private network, written as a literal. */
function privateAddress(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h.includes(":")) {
    // IPv6: loopback, unspecified, unique local, link local, and v4 mapped.
    return (
      h === "::1" ||
      h === "::" ||
      /^f[cd]/.test(h) ||
      /^fe[89ab]/.test(h) ||
      h.startsWith("::ffff:")
    );
  }
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/** The URL to fetch, or null when it is not one this may fetch. */
export function unfurlTarget(raw: string, own: string[] = []): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") && !host.includes(":")) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return null;
  if (host.endsWith(".internal") || host.endsWith(".test")) return null;
  if (OURS.has(host) || own.includes(host)) return null;
  if (privateAddress(host)) return null;
  // A bare IPv4 that is not private is still an address nobody writes a link to on purpose.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  u.hash = "";
  return u;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (all, name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith("#x"))
      return String.fromCodePoint(Number.parseInt(lower.slice(2), 16) || 32);
    if (lower.startsWith("#")) return String.fromCodePoint(Number(lower.slice(1)) || 32);
    return ENTITIES[lower] ?? all;
  });
}

const clean = (s: string | undefined, max: number) => {
  const t = decode(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** What a page's head says about it: Open Graph first, then Twitter's tags, then <title>. */
export function readOpenGraph(html: string): Preview {
  const head = html.slice(0, 256 * 1024);
  const meta = new Map<string, string>();
  for (const tag of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = new Map<string, string>();
    for (const a of tag[0].matchAll(/([a-z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/gi))
      attrs.set((a[1] as string).toLowerCase(), a[3] ?? a[4] ?? a[5] ?? "");
    const key = (attrs.get("property") || attrs.get("name") || "").toLowerCase();
    const content = attrs.get("content");
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return {
    title: clean(meta.get("og:title") || meta.get("twitter:title") || title, 200),
    description: clean(
      meta.get("og:description") || meta.get("twitter:description") || meta.get("description"),
      300,
    ),
    site: clean(meta.get("og:site_name"), 80),
  };
}

const NOTHING: Preview = { title: "", description: "", site: "" };
const TIMEOUT_MS = 4000;
const READ_MAX = 256 * 1024;

/** Reads at most `max` bytes of a body, so a page that never ends cannot hold the Worker. */
async function head(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.byteLength;
  }
  reader.cancel().catch(() => {});
  const all = new Uint8Array(Math.min(size, max));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.min(c.byteLength, all.byteLength - at));
    all.set(part, at);
    at += part.byteLength;
    if (at >= all.byteLength) break;
  }
  return new TextDecoder().decode(all);
}

/**
 * Fetches a page and reads its preview. Every redirect is checked as the first URL was; anything
 * that is not an HTML page, or does not answer in time, is a preview with nothing in it.
 */
export async function unfurl(
  raw: string,
  own: string[] = [],
  fetcher: typeof fetch = fetch,
): Promise<Preview> {
  let url = unfurlTarget(raw, own);
  for (let hop = 0; url && hop < 4; hop++) {
    let res: Response;
    try {
      res = await fetcher(url.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "Passalong link preview (+https://passalong.dev)",
        },
      });
    } catch {
      return NOTHING;
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      res.body?.cancel().catch(() => {});
      url = next ? unfurlTarget(new URL(next, url).href, own) : null;
      continue;
    }
    if (!res.ok || !/text\/html|application\/xhtml/i.test(res.headers.get("content-type") || "")) {
      res.body?.cancel().catch(() => {});
      return NOTHING;
    }
    return readOpenGraph(await head(res, READ_MAX));
  }
  return NOTHING;
}

/** Where the Cache API keeps previews; a path nothing routes, so nothing else can read an entry. */
type Store = Pick<Cache, "match" | "put">;
const store = (): Store | null =>
  (globalThis as { caches?: { default?: Store } }).caches?.default ?? null;

async function keyFor(origin: string, raw: string): Promise<Request> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)),
  );
  const hex = [...digest.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request(`${origin}/__unfurl/${hex}`);
}

/** A preview already read, or null. Never fetches: a page being rendered must not wait on another site. */
export async function cachedPreview(
  origin: string,
  raw: string,
  cache: Store | null = store(),
): Promise<Preview | null> {
  if (!cache) return null;
  const hit = await cache.match(await keyFor(origin, raw));
  return hit ? ((await hit.json()) as Preview) : null;
}

/**
 * The preview for a URL: from the cache, else read now and kept — a day when the page said
 * something, an hour when it did not. `later` keeps the Worker alive for the write after answering.
 */
export async function previewOf(
  origin: string,
  raw: string,
  own: string[],
  later?: (p: Promise<unknown>) => void,
  cache: Store | null = store(),
): Promise<Preview> {
  const hit = await cachedPreview(origin, raw, cache);
  if (hit) return hit;
  const preview = await unfurl(raw, own);
  if (cache) {
    const stored = keyFor(origin, raw)
      .then((key) =>
        cache.put(
          key,
          new Response(JSON.stringify(preview), {
            headers: {
              "content-type": "application/json",
              "cache-control": `max-age=${preview.title ? 86400 : 3600}`,
            },
          }),
        ),
      )
      .catch(() => {});
    if (later) later(stored);
    else await stored;
  }
  return preview;
}
