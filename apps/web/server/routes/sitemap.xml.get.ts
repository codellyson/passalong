// The pages a search engine is welcome to: the public ones, on the apex only.
//
// The list lives in shared/pages.ts. Everything else is a share link (its key is its
// authorisation), the signed-in hub, or a one-off flow like an invite or a reset — none of which
// belongs in an index. Drafts are listed there too, and left out here until they are finished.
import { APEX } from "#api/hosts";
import { PUBLIC_PAGES } from "#shared/pages";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "content-type", "application/xml; charset=utf-8");
  setResponseHeader(event, "cache-control", "public, max-age=3600");
  const urls = PUBLIC_PAGES.filter((p) => !p.draft)
    .map((p) => `  <url><loc>${APEX}${p.path}</loc><lastmod>${p.updated}</lastmod></url>`)
    .join("\n");
  // Posts, once the blog itself is published: each one by its own date.
  const blog = PUBLIC_PAGES.some((p) => p.path === "/blog" && !p.draft)
    ? (await publishedPosts())
        .map((p) => `  <url><loc>${APEX}/blog/${p.slug}</loc><lastmod>${p.date}</lastmod></url>`)
        .join("\n")
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}${blog ? `\n${blog}` : ""}
</urlset>
`;
});
