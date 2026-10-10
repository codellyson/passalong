import assert from "node:assert/strict";
import test from "node:test";
import { renderFolderMarkdown } from "../app/utils/folder-markdown.ts";

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
