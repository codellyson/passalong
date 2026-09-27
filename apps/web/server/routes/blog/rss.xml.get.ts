// The blog as RSS 2.0, for readers. Published posts only, newest first, the description as the
// summary and a link to the post — not the whole body, which the page renders under its own policy.
import { APEX } from "#api/hosts";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "content-type", "application/rss+xml; charset=utf-8");
  setResponseHeader(event, "cache-control", "public, max-age=3600");
  const posts = await publishedPosts();
  const items = posts
    .map(
      (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${APEX}/blog/${p.slug}</link>
      <guid isPermaLink="true">${APEX}/blog/${p.slug}</guid>
      <pubDate>${new Date(`${p.date}T09:00:00Z`).toUTCString()}</pubDate>
      <description>${esc(p.description)}</description>
    </item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Passalong blog</title>
    <link>${APEX}/blog</link>
    <description>What we are building, and why: handing work between AI coding agents and the people who send it.</description>
${items}
  </channel>
</rss>
`;
});
