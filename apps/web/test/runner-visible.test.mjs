// The runner made usable (2026-11-06): a ticked piece of work says where it runs and whether
// anything will take it, the board names each computer's repos once, and a person can watch what
// a runner's agent is doing as it does it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../app/${p}`, import.meta.url), "utf8");
const page = read("pages/hub/w/[id].vue");
const runAlone = read("components/hub/RunAlone.vue");
const steps = read("components/hub/RunSteps.vue");
const card = read("components/hub/BoardCard.vue");
const runners = read("components/hub/Runners.vue");
const util = read("utils/runner.ts");

test("the tick is on the work's page, with the repo it runs in, not at the foot of More", () => {
  assert.doesNotMatch(page, /role="menuitemcheckbox"[\s\S]{0,200}markAlone/);
  assert.match(page, /<HubRunAlone/);
  assert.match(runAlone, /json\("PUT", body\)/);
  assert.match(runAlone, /save\(\{ on: true, repo:/);
  assert.match(runAlone, /Pick the repo it runs in\. Until then no runner can take it\./);
  assert.match(runAlone, /No runner serves \$\{props\.runsIn\} right now/);
});

test("a ticked card says when nothing will take it", () => {
  assert.match(card, /text: "Pick a repo on its page so a runner can take it"/);
  assert.match(card, /No runner for \$\{w\.runs_in\.split\("\/"\)\.pop\(\)\} is running/);
  assert.match(util, /r\.endsWith\(`\/\$\{want\}`\) \|\| want\.endsWith\(`\/\$\{r\}`\)/);
});

test("one line per computer, naming what it serves and what each agent did last", () => {
  assert.match(runners, /const key = `\$\{r\.host\}\|\$\{r\.who\}`/);
  assert.match(runners, /serving \{\{ serving\(m\) \}\}/);
  assert.match(runners, /t\.step\.text/);
});

test("the work's page shows the agent's steps as they come", () => {
  assert.match(page, /<HubRunSteps :id="g\.id" :live="ctx\.claims\.length > 0" \/>/);
  assert.match(steps, /\/v1\/work\/\$\{props\.id\}\/steps\?after=\$\{after\}/);
  assert.match(steps, /setInterval\(load, 4000\)/);
  assert.match(steps, /aria-live="polite"/);
});
