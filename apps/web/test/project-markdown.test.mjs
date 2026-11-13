import assert from "node:assert/strict";
import test from "node:test";
import "./aliases.mjs";

const { renderProjectMarkdown } = await import("../app/utils/project-markdown.ts");

test("project documents render GFM without executing document content", () => {
  const html = renderProjectMarkdown(`| Feature | Route |
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

test("project documents keep GitHub alerts through the sanitizer, and only their classes", () => {
  const html = renderProjectMarkdown(
    '> [!CAUTION]\n> Deletes the bucket.\n\n<div class="x">raw</div>',
  );
  assert.match(html, /<div class="markdown-alert markdown-alert-caution">/);
  assert.match(html, /<p class="markdown-alert-title">Caution<\/p>/);
  assert.doesNotMatch(html, /class="x"/);
});

test("a GitHub link written as its URL is a chip in a project's document too", () => {
  const html = renderProjectMarkdown(
    "Shipped in https://github.com/khaime-team/website-builder/pull/2955.\n\n[our PR](https://github.com/a/b/pull/1)",
  );
  assert.match(
    html,
    /<a href="https:\/\/github\.com\/khaime-team\/website-builder\/pull\/2955" class="gh-ref" aria-label="Pull request #2955 in khaime-team\/website-builder on GitHub"><svg[^>]*><path d="M12[^"]*"><\/path><\/svg>website-builder #2955<\/a>/,
  );
  assert.match(html, /<a href="https:\/\/github\.com\/a\/b\/pull\/1">our PR<\/a>/);
});
