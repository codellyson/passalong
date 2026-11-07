// Links between a project's pages open them (utils/project-markdown.ts, 2026-11-07).
import assert from "node:assert/strict";
import test from "node:test";
import "./aliases.mjs";

const { renderProjectMarkdown, docKey } = await import("../app/utils/project-markdown.ts");
const docs = [
  { id: "d1", name: "Payments" },
  { id: "d2", name: "Storefront editor" },
  { id: "d3", name: "API logs viewer" },
];

test("a link naming a page opens it, however it was written", () => {
  const html = renderProjectMarkdown(
    "See [payments](payments.md), [editor](storefront-editor.md), [logs](./API_logs_viewer#top) and [p](Payments).",
    docs,
  );
  assert.match(html, /<a href="\?tab=documents&#x26;doc=d1">payments<\/a>/);
  assert.match(html, /doc=d2">editor<\/a>/);
  assert.match(html, /doc=d3">logs<\/a>/);
  assert.equal(docKey("Storefront_editor.md"), docKey("storefront editor"));
});

test("a link naming no page is left as its words, and web links are untouched", () => {
  const html = renderProjectMarkdown(
    "[gone](nothing.md) and [web](https://example.com) and [top](#a)",
    docs,
  );
  assert.match(html, /<p>gone and <a href="https:\/\/example.com">web<\/a>/);
  assert.match(html, /href="#a"/);
});

test("tables still render with links resolved, and without docs nothing changes", () => {
  const html = renderProjectMarkdown("| a | b |\n|---|---|\n| [p](payments.md) | 2 |", docs);
  assert.match(html, /<table>/);
  assert.match(html, /doc=d1/);
  assert.match(renderProjectMarkdown("[x](payments.md)"), /href="payments.md"/);
});
