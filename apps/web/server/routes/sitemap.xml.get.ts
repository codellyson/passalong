// The pages a search engine is welcome to: the public ones, on the apex only.
//
// Short and written out on purpose. Everything else is a share link (its key is its authorisation),
// the signed-in hub, or a one-off flow like an invite or a reset — none of which belongs in an
// index. A page added here should also carry `url` in its `usePage()` call, which is what emits its
// canonical link.
import { APEX } from "#api/hosts";

const PAGES = ["/", "/connect"];

export default defineEventHandler((event) => {
  setResponseHeader(event, "content-type", "application/xml; charset=utf-8");
  setResponseHeader(event, "cache-control", "public, max-age=3600");
  const urls = PAGES.map((p) => `  <url><loc>${APEX}${p}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
});
