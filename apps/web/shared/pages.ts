// The pages a search engine is welcome to, in one place.
//
// `/sitemap.xml` lists every page here that is not a draft, and the site footer links the ones
// that name a `footer` label. A draft page still renders — so it can be written and reviewed on the
// real site — but it is `noindex`, has no canonical link, is left out of the sitemap and is not
// linked from the footer. Publishing one is flipping `draft` to false, nothing else.
//
// Anything not listed here is private by default: share links, the hub, invites, resets.
export interface PublicPage {
  path: string;
  /** Still being written: rendered, but invisible to search engines and the footer. */
  draft: boolean;
  /** The footer's link text. Absent means the footer does not link it. */
  footer?: string;
}

export const PUBLIC_PAGES: PublicPage[] = [
  { path: "/", draft: false },
  { path: "/connect", draft: false },
  { path: "/docs", draft: true, footer: "Docs" },
  { path: "/docs/guide-format", draft: true, footer: "Guide format" },
  { path: "/faq", draft: true, footer: "FAQ" },
];

export function publicPage(path: string): PublicPage {
  const found = PUBLIC_PAGES.find((p) => p.path === path);
  if (!found) throw new Error(`${path} is not in PUBLIC_PAGES`);
  return found;
}
