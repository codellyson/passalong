// A guide made from a folder only lands in it if the sentence tells the agent which folder. These pin
// that every kind names the folder by id, and that a team folder's guide is addressed to its team.
import assert from "node:assert/strict";
import { test } from "node:test";
import { folderGuideAsk } from "../app/utils/asks.ts";

const folder = { id: "fld123", title: "Feature Guide" };

test("each kind asks for its own guide and then the link to this folder", () => {
  assert.match(folderGuideAsk("task", folder), /^Add a Passalong task: /);
  assert.match(folderGuideAsk("bug", folder), /^File this as a Passalong bug: /);
  assert.match(folderGuideAsk("handoff", folder), /^Pass this along\./);
  for (const kind of ["task", "bug", "handoff"])
    assert.match(
      folderGuideAsk(kind, folder),
      /Then link it to the Passalong folder "Feature Guide" \(fld123\)\.$/,
    );
});

test("a team folder's guide goes to that team, so the folder's members can see it", () => {
  const team = { ...folder, team: "acme" };
  assert.match(folderGuideAsk("task", team), /^Add a Passalong task for the team acme: /);
  assert.match(folderGuideAsk("bug", team), /^File this as a Passalong bug for the team acme: /);
  assert.match(folderGuideAsk("handoff", team), /^Pass this along for the team acme\./);
});
