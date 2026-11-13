// Share pages, blog posts and learn pages render Markdown through one remark pipeline. These pin
// what the page around that HTML relies on: the outline the contents rail is drawn from, figures
// for screenshots, and GitHub's footnotes and alerts. No heading means anything: none is marked.
import "./aliases.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const { renderBody, renderMarkdown } = await import("../server/utils/work-html.ts");

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
    /<a href="https:\/\/github\.com\/khaime-team\/website-builder\/pull\/2955" class="gh-ref" aria-label="Pull request #2955 in khaime-team\/website-builder on GitHub"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12[^"]*"><\/path><\/svg>website-builder #2955<\/a>/,
  );
  assert.match(html, /<a href="https:\/\/github\.com\/a\/b\/pull\/1">the fix<\/a>/);
  assert.match(html, /class="gh-ref"[^>]*>.*b run 9<\/a>/);
  // Not GitHub, not a chip.
  assert.doesNotMatch(renderBody("https://example.test/pull/1").html, /gh-ref/);
});
