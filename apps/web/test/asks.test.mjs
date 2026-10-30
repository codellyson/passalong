// Work made from a project only lands in it if the sentence tells the agent which project. These pin
// that the project is named by id, and that a team project's work is addressed to its team.
import assert from "node:assert/strict";
import { test } from "node:test";
import { newProjectAsk, projectAsk, readmeAsk } from "../app/utils/asks.ts";

const project = { id: "fld123", title: "Feature Guide" };

test("a project's ask names the project by title and id", () => {
  assert.match(projectAsk(project), /^Add this to Passalong: /);
  assert.match(projectAsk(project), /the Passalong project "Feature Guide" \(fld123\)\.$/);
  assert.match(readmeAsk(project), /project "Feature Guide" \(fld123\)/);
});

test("a team project's work goes to that team, so the project's members can see it", () => {
  assert.match(
    projectAsk({ ...project, team: "acme" }),
    /^Add this to Passalong for the team acme: /,
  );
  assert.match(newProjectAsk("acme"), /for the team acme/);
  assert.doesNotMatch(newProjectAsk(), /team/);
});
