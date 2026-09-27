// Every post in content/blog is one the blog can serve: a valid slug, a title, a date, and a draft
// flag said out loud. A file that fails any of these is silently left out by server/utils/blog.ts,
// which is the wrong way to find out.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const dir = new URL("../content/blog/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

test("there is at least one post", () => {
  assert.ok(files.length > 0);
});

for (const f of files) {
  test(`${f} has what the blog needs`, () => {
    assert.match(f.replace(/\.md$/, ""), /^[a-z0-9][a-z0-9-]*$/, "the file name is its slug");
    const raw = readFileSync(new URL(f, dir), "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(m, "it opens with frontmatter");
    const meta = Object.fromEntries(
      m[1]
        .split("\n")
        .map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]),
    );
    assert.ok(meta.title, "a title");
    assert.match(meta.date, /^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
    assert.ok(meta.description, "a description, for the index, the feed and the link preview");
    assert.match(meta.draft, /^(true|false)$/, "draft said out loud, not left to a default");
  });
}
