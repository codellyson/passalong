// The blog: markdown files in content/blog, bundled as server assets (nuxt.config.ts), read here.
// The /learn pages are the same thing from content/learn — long-lived guides rather than dated
// posts — so every reader here takes the collection, and the blog is the default.
//
// Each file is one post. Frontmatter is a few `key: value` lines — title, date (YYYY-MM-DD),
// description, author, draft — and the rest is the body. A draft renders at its address, so it can
// be read on the real site before it goes out, but it is left out of the index, the feed and the
// sitemap, and marked noindex. Publishing is `draft: false`.
//
// Posts are ours, not somebody else's markdown, but they go out under the same no-script policy as
// every other public page, so nothing in one can run.
import { Marked } from "marked";

export interface Post {
  slug: string;
  title: string;
  date: string;
  description: string;
  author: string;
  draft: boolean;
  /** Minutes to read, from the words in the body at about 230 a minute. */
  minutes: number;
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function parse(slug: string, raw: string): { post: Post; body: string } | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const meta: Record<string, string> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0)
      meta[line.slice(0, i).trim()] = line
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
  }
  const body = m[2] ?? "";
  if (!meta.title || !/^\d{4}-\d{2}-\d{2}$/.test(meta.date ?? "")) return null;
  return {
    body,
    post: {
      slug,
      title: meta.title,
      date: meta.date as string,
      description: meta.description ?? "",
      author: meta.author ?? "",
      draft: meta.draft !== "false",
      minutes: Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 230)),
    },
  };
}

/** The markdown collections bundled as server assets in nuxt.config.ts. */
export type Collection = "blog" | "learn";

/** Every post, newest first, drafts included. */
export async function allPosts(collection: Collection = "blog"): Promise<Post[]> {
  const store = useStorage(`assets:${collection}`);
  const keys = (await store.getKeys()).filter((k) => k.endsWith(".md"));
  const out: Post[] = [];
  for (const key of keys) {
    const slug = key.replace(/\.md$/, "");
    if (!SLUG.test(slug)) continue;
    const parsed = parse(slug, String((await store.getItem(key)) ?? ""));
    if (parsed) out.push(parsed.post);
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export const publishedPosts = async (collection: Collection = "blog") =>
  (await allPosts(collection)).filter((p) => !p.draft);

/** One post with its body rendered, or null when there is no such post. */
export async function postBySlug(
  slug: string,
  collection: Collection = "blog",
): Promise<(Post & { html: string }) | null> {
  if (!SLUG.test(slug)) return null;
  const raw = await useStorage(`assets:${collection}`).getItem(`${slug}.md`);
  if (raw === null || raw === undefined) return null;
  const parsed = parse(slug, String(raw));
  if (!parsed) return null;
  const html = new Marked({ gfm: true }).parse(parsed.body, { async: false }) as string;
  return { ...parsed.post, html };
}
