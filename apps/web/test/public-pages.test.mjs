// public/llms.txt is static, so it cannot ask shared/pages.ts whether a page is a draft the way
// the footer and masthead do. This keeps the two in step: flipping `draft` fails here until the
// link is added, and a link to a draft fails here until it is removed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isPublic, PUBLIC_PAGES } from "../shared/pages.ts";

const llms = readFileSync(new URL("../public/llms.txt", import.meta.url), "utf8");
const linked = (path) => new RegExp(`https://passalong\\.dev${path}(?![\\w/-])`).test(llms);

test("llms.txt links every live docs page and no draft", () => {
  for (const p of PUBLIC_PAGES.filter((x) => x.path.startsWith("/docs") || x.path === "/faq")) {
    if (p.draft) assert.ok(!linked(p.path), `llms.txt links ${p.path}, which is still a draft`);
    else assert.ok(linked(p.path), `${p.path} is live; add it to the Links in llms.txt`);
  }
});

test("isPublic() is false for drafts and for pages not listed", () => {
  assert.equal(isPublic("/"), true);
  assert.equal(isPublic("/hub"), false);
  for (const p of PUBLIC_PAGES) assert.equal(isPublic(p.path), !p.draft, p.path);
});
