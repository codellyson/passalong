// A guide's link and a folder's link are both secrets in a URL, read by people with no account.
// What keeps that safe is the same for both, so the same rules are pinned for both: the page runs
// no script under the strict policy, nothing indexes it, and the folder link opens no guides.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const at = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const CONFIG = at("../nuxt.config.ts");
const ROBOTS = at("../public/robots.txt");

for (const prefix of ["/g/", "/f/"]) {
  test(`${prefix} pages run no script and are never indexed`, () => {
    const rule =
      CONFIG.match(new RegExp(`"${prefix}\\*\\*": \\{([\\s\\S]*?)\\n {4}\\}`))?.[1] || "";
    assert.match(rule, /noScripts: true/, `${prefix}** must be noScripts`);
    assert.match(rule, /VIEW_HEADERS/, `${prefix}** must carry the strict policy`);
    assert.match(rule, /"x-robots-tag": "noindex, nofollow, noarchive"/);
    assert.match(ROBOTS, new RegExp(`^Disallow: ${prefix}$`, "m"));
  });
}

test("a folder link is checked against its key and opens no linked guides", () => {
  const util = at("../server/utils/shared-folder.ts");
  const page = at("../server/api/folder/[id]/[key].get.ts");
  const file = at("../server/routes/f/[id]/[key]/files/[asset].get.ts");
  assert.match(util, /WHERE id = \? AND share_key = \?/);
  for (const src of [util, page, file]) assert.doesNotMatch(src, /folder_guide|FROM guide/);
  // A file is only served if it sits in the shared subtree, and always as a download.
  assert.match(file, /tree\.some\(\(f\) => f\.id === asset\.folder_id\)/);
  assert.match(file, /content-disposition": `attachment;/);
  // Documents go through the sanitising renderer, not the guide one.
  assert.match(page, /renderFolderMarkdown/);
});
