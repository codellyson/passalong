// Share pages, blog posts and learn pages render Markdown through one remark pipeline. These pin
// what the page around that HTML relies on: the outline the contents rail is drawn from, figures
// for screenshots, and GitHub's footnotes and alerts. No heading means anything: none is marked.
import "./aliases.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const { idsIn, renderBody, renderMarkdown, urlsIn } = await import("../server/utils/work-html.ts");

test("h2 and h3 make the outline, no heading is marked, ids never repeat", () => {
  const { html, outline } = renderBody(
    "# Title\n\n## Problem\n\nx\n\n### Detail *one*\n\n## Steps\n\n1. a\n\n## Steps\n\n#### deep",
  );
  assert.deepEqual(outline, [
    { level: 2, text: "Problem", id: "problem" },
    { level: 3, text: "Detail one", id: "detail-one" },
    { level: 2, text: "Steps", id: "steps" },
    { level: 2, text: "Steps", id: "steps-1" },
  ]);
  assert.match(html, /<h2 id="problem">Problem<\/h2>/);
  assert.doesNotMatch(html, /data-kind/);
  assert.match(html, /<h3 id="detail-one">Detail <em>one<\/em><\/h3>/);
  // Below h3 is detail, not structure: it gets an id to link to and stays out of the rail.
  assert.match(html, /<h4 id="deep">deep<\/h4>/);
  assert.match(html, /<h1 id="title">Title<\/h1>/);
});

test("a heading's id comes from its words, not from the escaped HTML", () => {
  const { outline } = renderBody("## A teammate's agent & <kbd>you</kbd>");
  assert.equal(outline[0].text, "A teammate's agent & you");
  assert.equal(outline[0].id, "a-teammates-agent-you");
});

test("a screenshot on its own line becomes a captioned figure; one in a sentence does not", () => {
  const { html } = renderBody(
    "![The broken screen](https://passalong.dev/v1/shots/abc)\n\nInline ![icon](https://x.dev/i.png) here.",
  );
  assert.match(
    html,
    /<figure><img src="https:\/\/passalong\.dev\/v1\/shots\/abc" alt="The broken screen"><figcaption>The broken screen<\/figcaption><\/figure>/,
  );
  assert.match(html, /<p>Inline <img src="https:\/\/x\.dev\/i\.png" alt="icon"> here\.<\/p>/);
  assert.doesNotMatch(html, /<p><figure>/);
});

test("raw HTML passes through, because the page's CSP is what keeps it inert", () => {
  const { html } = renderBody("<details><summary>s</summary>b</details>");
  assert.match(html, /<details><summary>s<\/summary>b<\/details>/);
});

test("footnotes link both ways and their hidden label stays out of the outline", () => {
  const { html, outline } = renderBody("## Problem\n\nClaim.[^1]\n\n[^1]: Source.");
  assert.match(html, /href="#user-content-fn-1"/);
  assert.match(html, /id="user-content-fn-1"/);
  assert.match(html, /<section data-footnotes/);
  assert.deepEqual(
    outline.map((h) => h.text),
    ["Problem"],
  );
});

test("each of GitHub's five alerts becomes a titled callout", () => {
  for (const [marker, title] of [
    ["NOTE", "Note"],
    ["TIP", "Tip"],
    ["IMPORTANT", "Important"],
    ["WARNING", "Warning"],
    ["CAUTION", "Caution"],
  ]) {
    const html = renderMarkdown(`> [!${marker}]\n> Run the **migration** first.`);
    assert.match(
      html,
      new RegExp(
        `<div class="markdown-alert markdown-alert-${marker.toLowerCase()}">\\s*<p class="markdown-alert-title">${title}</p>\\s*<p>Run the <strong>migration</strong> first\\.</p>\\s*</div>`,
      ),
      marker,
    );
  }
});

test("an alert can run over several paragraphs, and lowercase markers count", () => {
  const html = renderMarkdown("> [!tip]\n> One.\n>\n> Two.");
  assert.match(html, /markdown-alert-tip/);
  assert.match(html, /<p>One\.<\/p>\s*<p>Two\.<\/p>/);
});

test("anything that is not exactly a marker line stays an ordinary quote", () => {
  for (const md of [
    "> [!DANGER]\n> x",
    "> [!NOTE] same line\n> x",
    "> plain [!NOTE]",
    "> **[!NOTE]**\n> x",
  ]) {
    const html = renderMarkdown(md);
    assert.match(html, /<blockquote>/, md);
    assert.doesNotMatch(html, /markdown-alert/, md);
  }
});

test("alerts render inside a section of a document", () => {
  const { html } = renderBody("## Verification\n\n> [!WARNING]\n> Staging only.");
  assert.match(html, /markdown-alert-warning/);
});

test("a URL in a code block is a link, and nothing else in the block changes", () => {
  const { html } = renderBody(
    "```text\nWorkflow: ci\nLink: https://ci.example.test/acme/shop/runs/9.\n<b>not markup</b>\n```",
  );
  assert.match(
    html,
    /Link: <a href="https:\/\/ci\.example\.test\/acme\/shop\/runs\/9">https:\/\/ci\.example\.test\/acme\/shop\/runs\/9<\/a>\./,
  );
  // What was text stays escaped text: a link is the only element the block gains.
  assert.match(html, /&#x3C;b>not markup&#x3C;\/b>/);
  assert.doesNotMatch(renderBody("```\nftp://x.test/a javascript:alert(1)\n```").html, /<a /);
});

test("a GitHub link written as its URL is a chip; one with its own words keeps them", () => {
  const { html } = renderBody(
    "Frontend half is in PR https://github.com/khaime-team/website-builder/pull/2955 (branch `x`).\n\n" +
      "See [the fix](https://github.com/a/b/pull/1).\n\n```text\nLink: https://github.com/a/b/actions/runs/9\n```",
  );
  assert.match(
    html,
    /<a href="https:\/\/github\.com\/khaime-team\/website-builder\/pull\/2955" class="forge-ref" aria-label="Pull request #2955 in khaime-team\/website-builder on GitHub"[^>]*><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12[^"]*"><\/path><\/svg>website-builder #2955<\/a>/,
  );
  // Its words stay; only a card is added, saying what the link is.
  assert.match(
    html,
    /<a href="https:\/\/github\.com\/a\/b\/pull\/1" aria-describedby="ref-\d+">the fix<\/a><span class="ref-card"/,
  );
  assert.match(html, /class="forge-ref"[^>]*>.*b run 9<\/a>/);
  // Not GitHub, not a chip.
  assert.doesNotMatch(renderBody("https://example.test/pull/1").html, /forge-ref/);
});

test("a bare work id is a link only when the caller knows it, and never inside a link", () => {
  // No title: a plain link, which is also what a code block gets.
  const works = new Map([
    [
      "p64kbrdt",
      { url: "https://passalong.dev/w/p64kbrdt/k3y", title: "", summary: "", status: "ready" },
    ],
  ]);
  const { html } = renderBody(
    "Frontend half of p64kbrdt, not of abcd2345. In code `p64kbrdt` too. [p64kbrdt](https://x.test)",
    works,
  );
  assert.match(
    html,
    /half of <a href="https:\/\/passalong\.dev\/w\/p64kbrdt\/k3y">p64kbrdt<\/a>, not of abcd2345\./,
  );
  assert.match(
    html,
    /<code><a href="https:\/\/passalong\.dev\/w\/p64kbrdt\/k3y">p64kbrdt<\/a><\/code>/,
  );
  assert.match(html, /<a href="https:\/\/x\.test">p64kbrdt<\/a>/);
  assert.deepEqual(idsIn("p64kbrdt and p64kbrdt, website, abcd2345"), ["p64kbrdt", "abcd2345"]);
  // An eight-letter word with no digit is not an id.
  assert.deepEqual(idsIn("payments feedback"), []);
});

test("work named in a document carries its card, shown by the stylesheet, not by script", () => {
  const works = new Map([
    [
      "p64kbrdt",
      {
        url: "https://passalong.dev/w/p64kbrdt/k3y",
        title: "Payout account verify",
        summary: "Check the bank before saving.",
        status: "ready",
      },
    ],
  ]);
  const { html } = renderBody(
    "Half of p64kbrdt, see https://passalong.dev/hub/w/p64kbrdt.\n\n```\np64kbrdt\n```",
    works,
    "passalong.dev",
  );
  assert.match(
    html,
    /<span class="ref"><a href="https:\/\/passalong\.dev\/w\/p64kbrdt\/k3y" aria-describedby="ref-0">p64kbrdt<\/a><span class="ref-card" id="ref-0" role="tooltip"><span class="ref-stage">Ready<\/span><span class="ref-title">Payout account verify<\/span><span class="ref-summary">Check the bank before saving\.<\/span><\/span><\/span>/,
  );
  // The link someone wrote to the work gets the card too, and keeps its words.
  assert.match(
    html,
    /<span class="ref"><a href="https:\/\/passalong\.dev\/hub\/w\/p64kbrdt" aria-describedby="ref-1">/,
  );
  // In a code block: the link, no card.
  assert.match(
    html,
    /<code><a href="https:\/\/passalong\.dev\/w\/p64kbrdt\/k3y">p64kbrdt<\/a>\n<\/code>/,
  );
  assert.doesNotMatch(html, /<script/);
});

test("a GitLab merge request written as its URL is a chip with GitLab's mark", () => {
  const { html } = renderBody(
    "See https://gitlab.com/techchak-backend-apps/techchak-backend/-/merge_requests/7038.",
  );
  assert.match(
    html,
    /<a href="https:\/\/gitlab\.com\/techchak-backend-apps\/techchak-backend\/-\/merge_requests\/7038" class="forge-ref" aria-label="Merge request !7038 in techchak-backend-apps\/techchak-backend on GitLab"[^>]*><svg[^>]*><path d="m23\.6[^"]*"><\/path><\/svg>techchak-backend !7038<\/a>/,
  );
});

test("a document's other links carry their preview's card, and forge links say what they are", () => {
  const previews = new Map([
    [
      "https://developer.mozilla.org/docs/csp",
      {
        title: "CSP header - HTTP | MDN",
        description: "Controls what a page may load.",
        site: "MDN Web Docs",
      },
    ],
  ]);
  const { html } = renderBody(
    "See https://developer.mozilla.org/docs/csp and https://gitlab.com/a/b/-/merge_requests/7 and https://unread.example/x.",
    undefined,
    "passalong.dev",
    previews,
  );
  assert.match(
    html,
    /<span class="ref"><a href="https:\/\/developer\.mozilla\.org\/docs\/csp" aria-describedby="ref-0">https:\/\/developer\.mozilla\.org\/docs\/csp<\/a><span class="ref-card" id="ref-0" role="tooltip"><span class="ref-stage">MDN Web Docs<\/span><span class="ref-title">CSP header - HTTP \| MDN<\/span><span class="ref-summary">Controls what a page may load\.<\/span><\/span><\/span>/,
  );
  // A forge chip has a card even with no preview: what the URL says.
  assert.match(
    html,
    /<span class="ref"><a href="https:\/\/gitlab\.com\/a\/b\/-\/merge_requests\/7" class="forge-ref"[^>]*aria-describedby="ref-1">.*?<\/a><span class="ref-card" id="ref-1" role="tooltip"><span class="ref-stage">GitLab<\/span><span class="ref-title">Merge request !7 in a\/b on GitLab<\/span><\/span><\/span>/,
  );
  // A page nobody has read yet is a plain link, never a wait.
  assert.match(html, /<a href="https:\/\/unread\.example\/x">https:\/\/unread\.example\/x<\/a>\./);
  assert.deepEqual(urlsIn("a https://x.example/1 and https://x.example/1."), [
    "https://x.example/1",
  ]);
});
