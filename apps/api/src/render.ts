// The thin web view: one read-only page per guide, plus a landing page. No editor, no app.
import { marked } from "marked";
import type { Meta } from "./guide.js";

// Bump when public/styles.css changes: _headers lets browsers cache it for an hour, and a stale
// stylesheet silently breaks new pages (the hub shipped unstyled to anyone who had visited).
const STYLES = "/styles.css?v=4";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

// The page chrome. Styles and icons are static assets (apps/api/public), so the document carries
// no inline CSS and the view's CSP can refuse it. Guide pages are noindex: a share link is for
// whoever holds it, not for search engines.
function page(o: {
  title: string;
  description: string;
  url?: string;
  noindex?: boolean;
  inner: string;
}): string {
  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${esc(o.title)}</title>`,
    `<meta name="description" content="${esc(o.description)}">`,
    o.noindex ? `<meta name="robots" content="noindex">` : "",
    `<meta name="theme-color" content="#b5451b">`,
    `<meta property="og:type" content="${o.url ? "article" : "website"}">`,
    `<meta property="og:site_name" content="Passalong">`,
    `<meta property="og:title" content="${esc(o.title)}">`,
    `<meta property="og:description" content="${esc(o.description)}">`,
    o.url ? `<meta property="og:url" content="${esc(o.url)}">` : "",
    `<meta name="twitter:card" content="summary">`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<link rel="manifest" href="/site.webmanifest">`,
    `<link rel="stylesheet" href="${STYLES}">`,
  ]
    .filter(Boolean)
    .join("");
  return `<!doctype html><html lang="en"><head>${head}</head><body><main>${o.inner}</main></body></html>`;
}

const BRAND = `<a class="brand" href="/"><img src="/favicon.svg" alt="">Passalong</a>`;

/** The first paragraph-ish run of the body, for the description meta. */
function summarize(body: string, max = 160): string {
  const text = body
    .replace(/^#+\s.*$/gm, "")
    .replace(/`[^`]*`/g, "")
    .replace(/[*_>#[\]]/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .find((p) => p.length > 0);
  if (!text) return "A Passalong transfer guide.";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export interface GuideView {
  id: string;
  meta: Meta;
  body: string;
  url: string;
  pulls: number;
}

export function renderGuide(g: GuideView): string {
  const html = marked.parse(g.body, { async: false, gfm: true }) as string;
  const tags = g.meta.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join(" ");
  const stack = g.meta.stack_assumptions.length
    ? `<span>assumes <b>${esc(g.meta.stack_assumptions.join(", "))}</b></span>`
    : "";
  const created = g.meta.created ? String(g.meta.created).slice(0, 10) : "";
  const inner = `
<header>
  ${BRAND}
  <h1>${esc(g.meta.title || g.id)}</h1>
  <div class="meta">
    <span>id <b>${esc(g.id)}</b></span>
    <span class="status">${esc(g.meta.status || "")}</span>
    ${g.meta.source_context ? `<span>from <b>${esc(String(g.meta.source_context))}</b></span>` : ""}
    ${g.meta.author ? `<span>by <b>${esc(String(g.meta.author))}</b></span>` : ""}
    ${created ? `<span>${esc(created)}</span>` : ""}
    ${stack}
    ${tags}
  </div>
</header>
<article>${html}</article>
<div class="pull">Pull this into your context:<br><code>passalong pull ${esc(g.url)}</code><br>or paste the link to an agent with the Passalong MCP server.</div>
<footer>Read-only. Edit the markdown in your own tools and <code>passalong share</code> again.</footer>`;
  return page({
    title: g.meta.title || g.id,
    description: summarize(g.body),
    url: g.url,
    noindex: true,
    inner,
  });
}

/** The hub: your synced guides. Everything dynamic happens in /hub.js against /v1/*. */
export function renderHub(): string {
  const inner = `
<header>
  ${BRAND}
  <h1>Your guides</h1>
  <div class="meta"><span>yours and your teams\u2019 · <a href="/">what is Passalong?</a></span></div>
</header>
<div id="app"><noscript><p>The hub needs JavaScript. The CLI does not: <code>passalong list</code>.</p></noscript></div>
<script src="/hub.js" defer></script>`;
  return page({
    title: "Passalong hub",
    description: "Your synced transfer guides.",
    noindex: true,
    inner,
  });
}

/** Where an invite link lands: the one command to run. */
export function renderJoin(o: { team: string; code: string; url: string }): string {
  const inner = `
<header>
  ${BRAND}
  <h1>Join ${esc(o.team)}</h1>
  <div class="meta"><span>an invite to a Passalong team</span></div>
</header>
<article>
<p>Teams share transfer guides: when a teammate finishes something you need to implement, they hand it to you and it lands in your inbox, ready for your agent.</p>
<h2>If you already have Passalong</h2>
<pre><code>passalong team join ${esc(o.url)}</code></pre>
<h2>If not</h2>
<pre><code>npm i -g passalong
passalong setup      # Claude Code skill + MCP server
passalong login      # your account
passalong me --handle you
passalong team join ${esc(o.url)}</code></pre>
</article>`;
  return page({
    title: `Join ${o.team}`,
    description: `Invitation to the ${o.team} team on Passalong.`,
    noindex: true,
    inner,
  });
}

export function renderHome(): string {
  const inner = `
<header>
  ${BRAND}
  <h1>Hand finished work to another context.</h1>
  <div class="meta"><span>a baton pass between repos, machines, agent sessions, and teammates</span></div>
</header>
<article>
<p>Solve something non-trivial in one agent session. Run one command. Open a session somewhere else and the agent there already knows the whole story: the problem, the decisions, the steps, how to verify, and what went wrong along the way.</p>
<h2>Install</h2>
<pre><code>npm i -g passalong
passalong setup     # Claude Code skill + MCP server
passalong login     # optional: sync across machines</code></pre>
<h2>The loop</h2>
<ol>
<li>Finish work in an agent session. Say <em>"pass this along"</em>, or run <code>passalong share</code>.</li>
<li>Review the draft, trim, publish. You get a short id and a link.</li>
<li>In the other context: <code>passalong pull &lt;id&gt;</code>, or hand the link to an agent.</li>
</ol>
<p>Guides are plain markdown with frontmatter. <code>passalong export</code> dumps everything. There is nothing to lock you in.</p>
<p>Already syncing? <a href="/hub">Open your hub</a>, or run <code>passalong hub</code>.</p>
</article>`;
  return page({
    title: "Passalong",
    description:
      "Hand finished work to another context. A baton pass between repos, machines, agent sessions, and teammates, in a form an agent can act on.",
    inner,
  });
}
