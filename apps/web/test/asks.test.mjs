// Work made from a folder only lands in it if the sentence tells the agent which folder. These pin
// that the folder is named by id, and that a team folder's work is addressed to its team.
import assert from "node:assert/strict";
import { test } from "node:test";
import { folderAsk, teamAsk } from "../app/utils/asks.ts";

const folder = { id: "fld123", title: "Feature Guide" };

test("a folder's ask names the folder by title and id", () => {
  assert.match(folderAsk(folder), /^Add this to Passalong: /);
  assert.match(folderAsk(folder), /the Passalong folder "Feature Guide" \(fld123\)\.$/);
});

test("a team folder's work goes to that team, so the folder's members can see it", () => {
  assert.match(
    folderAsk({ ...folder, team: "acme" }),
    /^Add this to Passalong for the team acme: /,
  );
  assert.match(teamAsk("acme"), /^Add this to Passalong for the team acme: /);
});
