import assert from "node:assert/strict";
import test from "node:test";
import "./aliases.mjs";

const { renderFolderMarkdown } = await import("../app/utils/folder-markdown.ts");

test("folder documents render GFM without executing document content", () => {
  const html = renderFolderMarkdown(`| Feature | Route |
| :--- | ---: |
| Sign up | /register |

- [x] Captured
- [ ] Review

~~Old~~ note[^1]

[^1]: Current details

![diagram](https://example.com/diagram.png)

<script>alert(1)</script>

[unsafe](javascript:alert(1))`);

  assert.match(html, /<table>/);
  assert.match(html, /<th align="right">Route<\/th>/);
  assert.match(html, /type="checkbox" checked disabled/);
  assert.match(html, /<del>Old<\/del>/);
  assert.match(html, /href="#user-content-fn-1"/);
  assert.match(html, /id="user-content-fn-1"/);
  assert.match(html, /href="https:\/\/example\.com\/diagram\.png">diagram<\/a>/);
  assert.doesNotMatch(html, /<img|<script|javascript:/i);
});

test("folder documents keep GitHub alerts through the sanitizer, and only their classes", () => {
  const html = renderFolderMarkdown(
    '> [!CAUTION]\n> Deletes the bucket.\n\n<div class="x">raw</div>',
  );
  assert.match(html, /<div class="markdown-alert markdown-alert-caution">/);
  assert.match(html, /<p class="markdown-alert-title">Caution<\/p>/);
  assert.doesNotMatch(html, /class="x"/);
});
