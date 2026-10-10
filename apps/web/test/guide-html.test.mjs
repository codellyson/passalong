// Guide pages, blog posts and learn pages render Markdown through one remark pipeline. These pin
// what the page around that HTML relies on: the outline the contents rail is drawn from, the
// section kinds a guide is typeset by, figures for screenshots, and GitHub's footnotes and alerts.
import "./aliases.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const { renderBody, renderMarkdown } = await import("../server/utils/guide-html.ts");

test("h2 and h3 make the outline, canonical sections carry their kind, ids never repeat", () => {
  const { html, outline } = renderBody(
    "# Title\n\n## Problem\n\nx\n\n### Detail *one*\n\n## Steps\n\n1. a\n\n## Steps\n\n#### deep",
    "guide",
  );
  assert.deepEqual(outline, [
    { level: 2, text: "Problem", id: "problem", kind: "problem" },
    { level: 3, text: "Detail one", id: "detail-one", kind: undefined },
    { level: 2, text: "Steps", id: "steps", kind: "steps" },
    { level: 2, text: "Steps", id: "steps-1", kind: "steps" },
  ]);
  assert.match(html, /<h2 id="problem" data-kind="problem">Problem<\/h2>/);
  assert.match(html, /<h3 id="detail-one">Detail <em>one<\/em><\/h3>/);
  // Below h3 is detail, not structure: it gets an id to link to and stays out of the rail.
  assert.match(html, /<h4 id="deep">deep<\/h4>/);
  assert.match(html, /<h1 id="title">Title<\/h1>/);
});

test("a heading's id comes from its words, not from the escaped HTML", () => {
  const { outline } = renderBody("## A teammate's agent & <kbd>you</kbd>", "guide");
  assert.equal(outline[0].text, "A teammate's agent & you");
  assert.equal(outline[0].id, "a-teammates-agent-you");
});

test("a screenshot on its own line becomes a captioned figure; one in a sentence does not", () => {
  const { html } = renderBody(
    "![The broken screen](https://passalong.dev/v1/shots/abc)\n\nInline ![icon](https://x.dev/i.png) here.",
    "guide",
  );
  assert.match(
    html,
    /<figure><img src="https:\/\/passalong\.dev\/v1\/shots\/abc" alt="The broken screen"><figcaption>The broken screen<\/figcaption><\/figure>/,
  );
  assert.match(html, /<p>Inline <img src="https:\/\/x\.dev\/i\.png" alt="icon"> here\.<\/p>/);
  assert.doesNotMatch(html, /<p><figure>/);
});

test("raw HTML passes through, because the page's CSP is what keeps it inert", () => {
  const { html } = renderBody("<details><summary>s</summary>b</details>", "guide");
  assert.match(html, /<details><summary>s<\/summary>b<\/details>/);
});

test("footnotes link both ways and their hidden label stays out of the outline", () => {
  const { html, outline } = renderBody("## Problem\n\nClaim.[^1]\n\n[^1]: Source.", "guide");
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

test("alerts render in a guide and inside the verify view's sections", () => {
  const { html } = renderBody("## Verification\n\n> [!WARNING]\n> Staging only.", "verify");
  assert.match(html, /markdown-alert-warning/);
});
