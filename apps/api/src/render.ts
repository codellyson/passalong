// The thin web view: one read-only page per guide, plus a landing page. No editor, no app.
import { marked } from "marked";
import { type Meta, verifyLayout } from "./guide.js";

// Bump when public/styles.css changes: _headers lets browsers cache it for an hour, and a stale
// stylesheet silently breaks new pages (the hub shipped unstyled to anyone who had visited).
const STYLES = "/styles.css?v=9";

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

const md = (s: string) => marked.parse(s, { async: false, gfm: true }) as string;

// What leads and what folds is decided in guide.ts; this only turns that into HTML.
function verifyBody(body: string): string {
  const { intro, lead, folded, by, hasVerification } = verifyLayout(body);
  const section = (s: string) => `<h2>${esc(s)}</h2>${md(by[s])}`;
  const missing = hasVerification
    ? ""
    : `<p class="note">This guide has no <b>Verification</b> section — there is nothing here that
       says what "working" looks like. Worth asking whoever wrote it.</p>`;
  const rest =
    intro || folded.length
      ? `<details class="rest">
  <summary>How it was built · ${folded.length ? esc(folded.join(", ")) : "notes"}</summary>
  ${intro ? md(intro) : ""}${folded.map(section).join("")}
</details>`
      : "";
  return `${missing}${lead.map(section).join("")}${rest}`;
}

export function renderGuide(g: GuideView, view: "guide" | "verify" = "guide"): string {
  const verify = view === "verify";
  const html = verify ? verifyBody(g.body) : md(g.body);
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
<nav class="views">
  <a${verify ? "" : ' class="on" aria-current="page"'} href="${esc(g.url)}">Full guide</a>
  <a${verify ? ' class="on" aria-current="page"' : ""} href="${esc(g.url)}?view=verify">Verify</a>
</nav>
<article>${html}</article>
${
  verify
    ? `<div class="pull">Checked it? Say so where it was handed to you: <a href="/hub">your hub</a> — or <code>passalong done ${esc(g.id)}</code>.</div>`
    : `<div class="pull">Pull this into your context:<br><code>passalong pull ${esc(g.url)}</code><br>or paste the link to an agent with the Passalong MCP server.</div>`
}
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
  <h1>Your transfers</h1>
  <div class="meta"><span>what is waiting, in flight, and landed · <a href="/">what is Passalong?</a></span></div>
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
<p>Teams share transfer guides: when someone finishes a piece of work you need to pick up — implement it, verify it, take it to another repo — they hand it to you and it lands in your inbox, written to be acted on.</p>
<div id="join" data-code="${esc(o.code)}" data-team="${esc(o.team)}">
  <noscript><p>This form needs JavaScript. The commands below do the same thing.</p></noscript>
</div>
<h2>Or from a terminal</h2>
<pre><code>npm i -g passalong
passalong login                 # your account
passalong me --handle you
passalong team join ${esc(o.url)}</code></pre>
</article>
<script src="/join.js" defer></script>`;
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
<p>A transfer has two ends, and Passalong is built for both of them.</p>

<h2>If you write the guides</h2>
<pre><code>npm i -g passalong
passalong setup     # Claude Code skill + MCP server
passalong login     # optional: sync across machines</code></pre>
<ol>
<li>Finish work in an agent session. Say <em>&ldquo;pass this along&rdquo;</em>, or run <code>passalong share</code>.</li>
<li>Review the draft, trim, publish. You get a short id and a link.</li>
<li>In the other context: <code>passalong pull &lt;id&gt;</code>, or hand the link to an agent.</li>
</ol>
<p>Hand one to a teammate with <code>passalong share --to team/@them</code>. <code>passalong board</code> then tells you what is waiting on you, what you handed over that nobody has taken, what landed, and what someone says does not work.</p>

<h2>If you pick them up</h2>
<p>Testers, teammates, anyone the work gets handed to. <b>Nothing to install.</b> Open the invite link a teammate sends you, pick a handle, and guides addressed to you land in your hub.</p>
<ul>
<li>Every guide has a <b>Verify</b> view that leads with what to check and folds the implementation away.</li>
<li>Two answers when you have tried it: it works, or it does not — with a reason the author sees the same day.</li>
<li>The person who handed it over can see it landed, so nobody has to ask.</li>
</ul>

<h2>No lock-in</h2>
<p>Guides are plain markdown with frontmatter. <code>passalong export</code> dumps everything. Deleting your account leaves you with all of your content.</p>

<p>Already have an account? <a href="/hub">Open your hub</a>, or run <code>passalong hub</code>.</p>
</article>`;
  return page({
    title: "Passalong",
    description:
      "Hand finished work to another context. A baton pass between repos, machines, agent sessions, and teammates, in a form an agent can act on.",
    inner,
  });
}
