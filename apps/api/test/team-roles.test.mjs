// Admins: who may promote, demote and remove, and who can never be. Pinned by reading the routes'
// source (the app is not importable under type stripping).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const route = (from) =>
  index.slice(index.indexOf(from), index.indexOf("\n});\n", index.indexOf(from)));
const patch = route('app.patch("/v1/teams/:slug/members/:who"');
const del = route('app.delete("/v1/teams/:slug/members/:who"');

test("only an admin changes roles, and the maker of the team stays one", () => {
  assert.match(patch, /team\.role !== "owner"\) return err\(c, 403/);
  assert.match(patch, /who\.id === team\.created_by && role !== "owner"/);
  assert.match(patch, /return err\(c, 403/);
});

test("promoting tells the person; demoting and a no-op do not", () => {
  assert.match(
    patch,
    /if \(role === "owner"\)\s+await notify\(c\.env, \{\s+to: who\.id,\s+kind: "promoted"/,
  );
});

test("anyone may leave, only an admin removes, and the maker can do neither", () => {
  assert.match(del, /const leaving = who\.id === me/);
  assert.match(del, /!leaving && team\.role !== "owner"/);
  assert.match(del, /who\.id === team\.created_by/);
});

test("removing someone releases their holds and takes them out of the team's groups", () => {
  assert.match(
    del,
    /DELETE FROM claim WHERE account_id = \? AND guide_id IN \(SELECT id FROM guide WHERE team_id = \?\)/,
  );
  assert.match(
    del,
    /DELETE FROM group_member WHERE account_id = \? AND group_id IN \(SELECT id FROM team_group WHERE team_id = \?\)/,
  );
  assert.match(del, /DELETE FROM membership WHERE team_id = \? AND account_id = \?/);
});

test("the team answer says who made it", () => {
  assert.match(index, /creator: m\.id === team\.created_by/);
});
