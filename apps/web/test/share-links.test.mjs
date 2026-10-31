// A piece of work's link and a project's link are both secrets in a URL, read by people with no account.
// What keeps that safe is the same for both, so the same rules are pinned for both: the page runs
// no script under the strict policy, nothing indexes it, and the project link opens no work.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const at = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const CONFIG = at("../nuxt.config.ts");
const ROBOTS = at("../public/robots.txt");

for (const prefix of ["/w/", "/p/"]) {
  test(`${prefix} pages run no script and are never indexed`, () => {
    const rule =
      CONFIG.match(new RegExp(`"${prefix}\\*\\*": \\{([\\s\\S]*?)\\n {4}\\}`))?.[1] || "";
    assert.match(rule, /noScripts: true/, `${prefix}** must be noScripts`);
    assert.match(rule, /VIEW_HEADERS/, `${prefix}** must carry the strict policy`);
    assert.match(rule, /"x-robots-tag": "noindex, nofollow, noarchive"/);
    assert.match(ROBOTS, new RegExp(`^Disallow: ${prefix}$`, "m"));
  });
}

test("a project link is checked against its key and opens no linked work", () => {
  const util = at("../server/utils/shared-project.ts");
  const page = at("../server/api/project/[id]/[key].get.ts");
  const file = at("../server/routes/p/[id]/[key]/files/[file].get.ts");
  assert.match(util, /WHERE id = \? AND share_key = \?/);
  for (const src of [util, page, file]) assert.doesNotMatch(src, /project_work|FROM work/);
  // A file is only served if it sits in the shared subtree, and always as a download.
  assert.match(file, /tree\.some\(\(f\) => f\.id === file\.project_id\)/);
  assert.match(file, /content-disposition": `attachment;/);
  // Documents go through the sanitising renderer, not the work one.
  assert.match(page, /renderProjectMarkdown/);
});
