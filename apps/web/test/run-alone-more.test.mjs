// Making work for the runner easy to queue and to follow (2026-11-06): tick it as it is written,
// tick a whole project's new work, filter the board to what runs alone, and see the runner's
// status on the board instead of in a terminal.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const api = read("../../api/src/index.ts");
const projects = read("../../api/src/projects.ts");
const newWork = read("../app/pages/hub/new.vue");
const project = read("../app/pages/hub/projects/[id].vue");
const board = read("../app/pages/hub/work.vue");
const lists = read("../app/composables/useWorkLists.ts");
const runners = read("../app/components/hub/Runners.vue");

test("new work is ticked as it is written, by a person, or by its project's setting", () => {
  assert.match(newWork, /<input v-model="alone" type="checkbox"/);
  assert.match(newWork, /alone: alone\.value,/);
  assert.match(newWork, /if \(got\.project\.alone_default\) alone\.value = true;/);
  assert.match(
    api,
    /const alone = \(body\.alone === true \|\| projectAlone\) && byPerson\(c\.get\("client"\)\);/,
  );
  assert.match(api, /function byPerson\(client: unknown\): boolean \{\s*return client === "hub";/);
});

test("only a person turns a project's setting on, from the project's page", () => {
  assert.match(
    projects,
    /if \(Object\.hasOwn\(input, "alone_default"\) && c\.get\("client"\) !== "hub"\)/,
  );
  assert.match(project, /<input type="checkbox" name="alone_default"/);
  assert.match(project, /New work runs alone/);
});

test("the board filters to what runs alone", () => {
  assert.match(board, /<input v-model="aloneOnly" type="checkbox" \/>\s*Runs alone/);
  assert.match(
    lists,
    /if \(aloneOnly\?\.value && !\(g\.alone && g\.status !== "done"\)\) return false;/,
  );
});

test("the board says what the runners are on, from what they report", () => {
  assert.match(board, /<HubRunners \/>/);
  assert.match(runners, /api<\{ runners: RunnerRow\[\] \}>\("\/v1\/runners"\)/);
  assert.match(api, /app\.put\("\/v1\/runner"/);
  assert.match(api, /live: !r\.stopped && at - Date\.parse\(r\.seen\) < RUNNER_LIVE_MS,/);
});
