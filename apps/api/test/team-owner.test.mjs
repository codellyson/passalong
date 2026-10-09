// What a team's owner may do to anyone's guide in it, pinned by reading the routes' source (the app
// is not importable under type stripping). The task verbs are tested against a database in
// claims.test.mjs; these are the routes that decide by `found.owner` in index.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const route = (from) =>
  index.slice(index.indexOf(from), index.indexOf("\n});\n", index.indexOf(from)));

test("delete is the author's or the owner of its team, and no one else's", () => {
  const r = route('app.delete("/v1/guides/:id"');
  assert.match(r, /!found\.owner && !\(await ownsTeam\(c, found\.row\)\)/);
  assert.match(r, /return err\(c, 403/);
});

test("assign is the author's, the assignee's, or the owner of its team", () => {
  const r = route('app.post("/v1/guides/:id/assign"');
  assert.match(r, /!found\.owner && !assignee && !\(await ownsTeam\(c, row\)\)/);
});

test("a guide row says whether you manage it: its author, or an owner of its team", () => {
  assert.match(
    index,
    /manage: r\.account_id === me \|\| teams\.get\(r\.team_id\)\?\.role === "owner"/,
  );
});

test("ownsTeam asks for the owner role in the guide's own team", () => {
  const r = route("async function ownsTeam");
  assert.match(r, /role = 'owner'/);
  assert.match(r, /team_id = \? AND account_id = \?/);
});
