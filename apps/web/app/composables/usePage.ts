// The per-page half of `page()` in apps/api/src/render.ts: everything that differs by route.
// The constants it also set — charset, viewport, theme colour, icons, manifest — are in
// nuxt.config.ts under `app.head`, because they never vary.
export interface PageMeta {
  title: string;
  description: string;
  /** Canonical URL. Only a guide page has one; everything else is noindex anyway. */
  url?: string;
  /** Absolute URL of the unfurl image. Without one, a shared link is a bare box of text. */
  image?: string;
  /** A share link is for whoever holds it, not for search engines. */
  noindex?: boolean;
}

export function usePage(meta: PageMeta) {
  useSeoMeta({
    title: meta.title,
    description: meta.description,
    robots: meta.noindex ? "noindex" : undefined,
    ogType: meta.url ? "article" : "website",
    ogTitle: meta.title,
    ogDescription: meta.description,
    ogUrl: meta.url,
    ogImage: meta.image,
    ogImageWidth: meta.image ? 1200 : undefined,
    ogImageHeight: meta.image ? 630 : undefined,
    twitterCard: meta.image ? "summary_large_image" : "summary",
    twitterImage: meta.image,
  });
}
