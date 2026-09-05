// The thin web view: one read-only page per guide, plus a landing page. No editor, no app.
import { marked } from "marked";
import { type Meta, verifyLayout } from "./guide.js";

// Bump when public/styles.css changes: _headers lets browsers cache it for an hour, and a stale
// stylesheet silently breaks new pages (the hub shipped unstyled to anyone who had visited).
const STYLES = "/styles.css?v=15";

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
  /** Absolute URL of the unfurl image. Without one, a shared link is a bare box of text. */
  image?: string;
  /** The landing runs wider than a reading column; every other page does not. */
  wide?: boolean;
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
    `<meta name="twitter:card" content="${o.image ? "summary_large_image" : "summary"}">`,
    o.image ? `<meta property="og:image" content="${esc(o.image)}">` : "",
    o.image ? `<meta property="og:image:width" content="1200">` : "",
    o.image ? `<meta property="og:image:height" content="630">` : "",
    o.image ? `<meta name="twitter:image" content="${esc(o.image)}">` : "",
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<link rel="manifest" href="/site.webmanifest">`,
    `<link rel="stylesheet" href="${STYLES}">`,
  ]
    .filter(Boolean)
    .join("");
  const main = o.wide ? `<main class="wide">` : `<main>`;
  return `<!doctype html><html lang="en"><head>${head}</head><body>${main}${o.inner}</main></body></html>`;
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
<article class="prose">${html}</article>
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
    // A guide travels as a pasted link — in Slack, in a DM, into an agent. The unfurl card is
    // the first thing anyone sees of it, so it is rendered per guide rather than left blank.
    image: `${g.url}/og.png`,
    noindex: true,
    inner,
  });
}

/**
 * The hub: your synced guides. Everything dynamic happens in /hub.js against /v1/*.
 *
 * The document deliberately carries no heading. This one route serves two different screens —
 * signing in, and the hub itself — and auth state lives in a cookie the client reads, not here.
 * A server-rendered header could only ever describe one of them, which is how a signed-out
 * visitor ended up being told these were "Your transfers". Each state renders its own.
 */
export function renderHub(): string {
  const inner = `
<div id="app"><noscript><p><b>Passalong</b> — the hub needs JavaScript. The CLI does not: <code>passalong list</code>.</p></noscript></div>
<script type="module" src="/hub.js"></script>`;
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
<script type="module" src="/join.js"></script>`;
  return page({
    title: `Join ${o.team}`,
    description: `Invitation to the ${o.team} team on Passalong.`,
    noindex: true,
    inner,
  });
}

/**
 * Setting a new password from an emailed link. The code rides in the fragment, exactly like the
 * hub's token: fragments are not sent to the server, so the credential never lands in a log.
 */
export function renderReset(): string {
  const inner = `
<header>
  ${BRAND}
  <h1>Choose a new password</h1>
  <div class="meta"><span>the link works once, and for an hour</span></div>
</header>
<div id="reset"><noscript><p>This page needs JavaScript.</p></noscript></div>
<script type="module" src="/reset.js"></script>`;
  return page({
    title: "Reset your password",
    description: "Set a new Passalong password.",
    noindex: true,
    inner,
  });
}

/**
 * The landing page. It leads with what the product *produces* — a guide, rendered — rather than
 * describing it in paragraphs, and puts the two things a stranger can do (install it, open the
 * hub) above the fold. The page runs no script and loads no third-party asset: the `.showcase`
 * is built from markup, because this view's CSP allows neither.
 */
export function renderHome(): string {
  const showcase = `
<section class="showcase" aria-label="A transfer guide, as the person picking it up sees it">
  <div class="bar">
    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    <span class="url">passalong.dev/g/ejdq3v8q &middot; Verify</span>
  </div>
  <div class="body">
    <div class="meta">
      <span>id <b>ejdq3v8q</b></span>
      <span class="status">published</span>
      <span>by <b>@marta</b></span>
      <span>assumes <b>Postgres 16, Node 22</b></span>
      <span class="tag">#migrations</span>
    </div>
    <h3>Backfill order totals without locking the table</h3>
    <div class="sc-prose">
      <h4>Verification</h4>
      <ol>
        <li>Run <code>pnpm verify:totals</code> — every row reconciles, exit 0.</li>
        <li>Check <code>pg_stat_activity</code> during the backfill: no lock waits over 50ms.</li>
      </ol>
      <h4>Gotchas</h4>
      <p>The obvious single <code>UPDATE</code> takes an <code>ACCESS EXCLUSIVE</code> lock and
      stalls checkout for ~40s. Batching by primary key in chunks of 5,000 avoids it.</p>
    </div>
    <p class="folded">How it was built &middot; Problem, Solution shape, Decisions, Steps</p>
  </div>
</section>`;

  const inner = `
<header class="hero">
  ${BRAND}
  <h1>Hand finished work to another context.</h1>
  <p class="lede">Solve something non-trivial in one agent session. Open a session somewhere else &mdash;
  another repo, another machine, a teammate &mdash; and the agent there already knows the whole story:
  the problem, the decisions, the steps, how to verify, and what went wrong along the way.</p>
  <div class="cta">
    <a class="btn primary lg" href="/hub">Open your hub</a>
    <span class="cta-cmd"><b>$</b><span>npm i -g passalong</span></span>
  </div>
</header>

${showcase}

<h2 class="eyebrow">How a transfer works</h2>
<ol class="steps">
  <li>
    <b>Finish the work</b>
    <p>In an agent session, say <em>&ldquo;pass this along&rdquo;</em>, or run <code>passalong share</code>.
    It distills what you just did into a guide.</p>
  </li>
  <li>
    <b>Review and publish</b>
    <p>Trim the draft. You get a short id and a link. Hand it to a teammate with
    <code>--to team/@them</code>.</p>
  </li>
  <li>
    <b>Pick it up anywhere</b>
    <p>Run <code>passalong pull &lt;id&gt;</code> in the other context, or paste the link to an
    agent. Nothing to install on the receiving end.</p>
  </li>
</ol>

<div class="two">
  <section class="panel">
    <h2>If you write the guides</h2>
    <pre><code>npm i -g passalong
passalong setup     # Claude Code skill + MCP
passalong login     # sync across machines</code></pre>
    <p><code>passalong board</code> then tells you what is waiting on you, what you handed over
    that nobody has taken, what landed, and what someone says does not work.</p>
  </section>
  <section class="panel">
    <h2>If you pick them up</h2>
    <p>Testers, teammates, anyone the work gets handed to. <b>Nothing to install.</b> Open the
    invite link, pick a handle, and guides addressed to you land in your hub.</p>
    <ul>
      <li>Every guide has a <b>Verify</b> view that leads with what to check and folds the
      implementation away.</li>
      <li>Two answers when you have tried it: it works, or it does not &mdash; with a reason the
      author sees the same day.</li>
      <li>The person who handed it over can see it landed, so nobody has to ask.</li>
    </ul>
  </section>
</div>

<section class="closer">
  <h2>No lock-in</h2>
  <p>Guides are plain markdown with frontmatter. <code>passalong export</code> dumps everything.
  Deleting your account leaves you with all of your content.</p>
  <div class="cta">
    <a class="btn primary lg" href="/hub">Open your hub</a>
    <a class="btn lg" href="https://www.npmjs.com/package/passalong">passalong on npm</a>
  </div>
</section>

<footer>
  Already have an account? <a href="/hub">Open your hub</a>, or run <code>passalong hub</code>.
</footer>`;
  return page({
    title: "Passalong",
    description:
      "Hand finished work to another context. A baton pass between repos, machines, agent sessions, and teammates, in a form an agent can act on.",
    wide: true,
    inner,
  });
}
