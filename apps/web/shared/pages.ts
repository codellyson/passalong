// The pages a search engine is welcome to, in one place.
//
// `/sitemap.xml` lists every page here that is not a draft, and the site footer links the ones
// that name a `footer` label. A draft page still renders — so it can be written and reviewed on the
// real site — but it is `noindex`, has no canonical link, is left out of the sitemap and is not
// linked from anywhere: the footer, the masthead's Docs link, the landing's closer and /connect all
// ask `published()` first. Publishing one is flipping `draft` to false.
//
// The one place that cannot ask is public/llms.txt, which is a static file. test/public-pages.test.mjs
// fails when it links a draft or misses a published page, so flipping the flag tells you to add the
// line there too.
//
// Anything not listed here is private by default: share links, the hub, invites, resets.
export interface PublicPage {
  path: string;
  /** Still being written: rendered, but invisible to search engines and the footer. */
  draft: boolean;
  /** The footer's link text. Absent means the footer does not link it. */
  footer?: string;
  /**
   * When this page's copy last changed, as YYYY-MM-DD, for the sitemap's `lastmod`.
   *
   * Written by hand and worth only as much as it is kept true: a date that claims every page
   * changed on every deploy is one a crawler learns to ignore. Change the copy, change the date.
   */
  updated: string;
}

export const PUBLIC_PAGES: PublicPage[] = [
  { path: "/", draft: false, updated: "2026-10-03" },
  { path: "/mcp-server", draft: false, updated: "2026-10-03" },
  { path: "/connect", draft: false, updated: "2026-10-03" },
  { path: "/docs", draft: false, footer: "Docs", updated: "2026-10-03" },
  { path: "/docs/guide-format", draft: false, footer: "Guide format", updated: "2026-09-27" },
  { path: "/faq", draft: false, footer: "FAQ", updated: "2026-10-03" },
  // A draft until its first post is published. The posts themselves are content/blog/*.md, each
  // with its own `draft`, and the sitemap lists the published ones once /blog is.
  { path: "/blog", draft: true, footer: "Blog", updated: "2026-09-27" },
  // The /learn guides, one entry each: content/learn/<slug>.md renders at its address either way,
  // and this flag is what indexes it.
  {
    path: "/learn/ai-agent-handoff",
    draft: false,
    footer: "Handing work to agents",
    updated: "2026-10-03",
  },
  { path: "/learn/handoff-md", draft: false, updated: "2026-10-03" },
  { path: "/learn/write-tasks-for-ai-coding-agents", draft: false, updated: "2026-10-03" },
  { path: "/learn/bug-report-template-for-ai-agents", draft: false, updated: "2026-10-03" },
  {
    path: "/learn/run-multiple-ai-coding-agents",
    draft: false,
    footer: "Running several agents",
    updated: "2026-10-03",
  },
  { path: "/learn/setup-claude-code", draft: false, updated: "2026-10-03" },
  { path: "/learn/setup-codex", draft: false, updated: "2026-10-03" },
  { path: "/learn/setup-chatgpt", draft: false, updated: "2026-10-03" },
  { path: "/learn/setup-claude", draft: false, updated: "2026-10-03" },
  { path: "/learn/passalong-vs-handoff-md", draft: false, updated: "2026-10-03" },
  { path: "/learn/passalong-vs-issue-tracker", draft: false, updated: "2026-10-03" },
];

/** Whether a page may be linked: listed here and no longer a draft. */
export function published(path: string): boolean {
  return PUBLIC_PAGES.some((p) => p.path === path && !p.draft);
}

export function publicPage(path: string): PublicPage {
  const found = PUBLIC_PAGES.find((p) => p.path === path);
  if (!found) throw new Error(`${path} is not in PUBLIC_PAGES`);
  return found;
}
