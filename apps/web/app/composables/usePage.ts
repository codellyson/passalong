// The per-page half of `page()` in apps/api/src/render.ts: everything that differs by route.
// The constants it also set — charset, viewport, theme colour, icons, manifest — are in
// nuxt.config.ts under `app.head`, because they never vary.
export interface PageMeta {
  title: string;
  description: string;
  /**
   * The page's absolute URL. On an indexable page it is also the canonical link, so it must name
   * the apex (`APEX` in apps/api/src/hosts.ts) — the legacy host serves the same pages, and without
   * a canonical a search engine counts them as two.
   */
  url?: string;
  /** Absolute URL of the unfurl image. Without one, a shared link is a bare box of text. */
  image?: string;
  /** A share link is for whoever holds it, not for search engines. */
  noindex?: boolean;
  /** `article` for a guide; everything else is the site itself. */
  type?: "website" | "article";
}

export function usePage(meta: PageMeta) {
  useSeoMeta({
    title: meta.title,
    description: meta.description,
    robots: meta.noindex ? "noindex" : undefined,
    ogType: meta.type ?? "website",
    ogTitle: meta.title,
    ogDescription: meta.description,
    ogUrl: meta.url,
    ogImage: meta.image,
    ogImageWidth: meta.image ? 1200 : undefined,
    ogImageHeight: meta.image ? 630 : undefined,
    twitterCard: meta.image ? "summary_large_image" : "summary",
    twitterTitle: meta.title,
    twitterDescription: meta.description,
    twitterImage: meta.image,
  });
  // No canonical on a noindex page: a share link's URL carries its key, and a canonical is one more
  // place for a fetcher to pick it up for no benefit.
  if (meta.url && !meta.noindex) useHead({ link: [{ rel: "canonical", href: meta.url }] });
}
