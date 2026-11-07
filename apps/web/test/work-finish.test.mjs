// Mark done, on a work page. A person had no way to finish work: an author cannot take their own,
// so they had only Archive, which says it was closed without being done (2026-11-04).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const page = read("../app/pages/hub/w/[id].vue");
const hub = read("../app/composables/useHub.ts");
const progress = read("../app/utils/progress.ts");

test("Mark done sits beside the lead whenever nobody is on the work; Archive and Stop are in More", () => {
  assert.match(
    page,
    /const mayFinish = computed\(\(\) => Boolean\(g\.value\) && g\.value\?\.status !== "done" && !holding\.value\);/,
  );
  assert.match(page, /return mayFinish\.value \? "finish" : "";/);
  assert.match(page, /<button v-if="beside === 'finish'"[^>]*@click="show\('finish'\)">/);
  assert.match(
    page,
    /v-if="mayFinish && beside !== 'finish'"[^>]*>Mark done…<\/button>/,
    "else More",
  );
  // Ending things is never the first button a person meets (2026-11-07).
  assert.match(page, /if \(holding\.value\) return "";/, "no Stop as the lead");
  assert.doesNotMatch(page, /beside === 'archive'/);
  assert.match(page, /<button v-if="holding" role="menuitem"[^>]*@click="pick\(takeBack\)">/);
  assert.match(
    page,
    /<button v-if="mayArchive && g\.status !== 'done'" role="menuitem"[^>]*@click="pick\(archive\)">/,
  );
});

test("it asks what was done, never insists, and finishes through the server", () => {
  assert.match(page, /<input id="finish-note" name="note" class="[^"]*" maxlength="1000"/);
  assert.doesNotMatch(page, /<input id="finish-note"[^>]*required/);
  assert.match(
    hub,
    /api\(`\/v1\/work\/\$\{encodeURIComponent\(id\)\}\/finish`, json\("POST", \{ note \}\)\)/,
  );
});

test("your own finish is said as You, and your agent's as Your agent", () => {
  assert.match(page, /<b class="font-ui text-sm font-medium">\{\{ actorOf\(shown\) \}\}<\/b>/);
  assert.match(progress, /who: actorOf\(v\),/);
  assert.match(
    progress,
    /o\.agent \? \(o\.mine \? "Your agent" : `\$\{nameOf\(o\.by\)\}'s agent`\) : o\.mine \? "You"/,
  );
});
