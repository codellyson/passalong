// Naming several people on one guide, and taking a sent guide back. Pinned by reading the routes'
// source, as guide-context.test.mjs does: the app is not importable under type stripping.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const between = (from, to) =>
  index.slice(index.indexOf(from), index.indexOf(to, index.indexOf(from)));

const recall = between('app.post("/v1/guides/:id/recall"', 'app.post("/v1/guides/:id/send_back"');
const adhoc = between("const ADHOC_MAX", "/** Whether the caller owns the team");

test("recall is the author's, for a sent non-task, and not while somebody is on it", () => {
  assert.ok(recall.length > 0, "found the route");
  assert.match(recall, /if \(!found\.owner\) return err\(c, 403/);
  assert.match(recall, /row\.kind === "task"/);
  assert.match(recall, /if \(!row\.team_id\)\s+return err\(c, 400/);
  assert.match(recall, /FROM claim c[\s\S]*WHERE c\.guide_id = \?/);
  assert.match(recall, /if \(holder\)[\s\S]*409/);
});

test("recall makes it private again in the row and in the document", () => {
  assert.match(recall, /team_id = '', to_account_id = '', to_group_id = ''/);
  assert.match(recall, /dropField\(dropField\(row\.markdown, "to"\), "team"\)/);
});

test("recall says how many had already opened it, and does not promise to unpull", () => {
  assert.match(recall, /already_opened_by/);
  assert.match(recall, /FROM pull WHERE guide_id = \? AND account_id <> \?/);
});

test("several people become one hidden group: ~slug, the same people the same group, at most ten", () => {
  assert.match(adhoc, /ADHOC_MAX = 10/);
  assert.match(adhoc, /`~\$\{\(await sha256\(/);
  assert.match(adhoc, /\.sort\(\)/, "order of the handles does not change who is in it");
  assert.match(adhoc, /handles\.length < 2/);
  assert.match(adhoc, /isn't in \$\{team\.name\}/, "a handle outside the team is refused");
});

test("publish and assign both read a list, and the team never sees the group", () => {
  assert.equal((index.match(/await adhocGroup\(c, team, raw\)/g) ?? []).length, 2);
  assert.match(index, /g\.slug NOT LIKE '~%'/, "not listed");
  assert.match(index, /slug NOT LIKE '~%'"/, "not counted against the twenty");
});
