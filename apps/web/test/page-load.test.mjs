// The work page and a project's page were slow to open (2026-11-11): each waited for /v1/me before
// asking for its own data, then asked for the rest one answer at a time. These pin the order they
// load in now, which nothing on screen shows until it is slow again.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const work = read("../app/pages/hub/w/[id].vue");
const project = read("../app/pages/hub/projects/[id].vue");
const thread = read("../app/components/hub/Thread.vue");
const shell = read("../app/components/hub/Shell.vue");
const hub = read("../app/composables/useHub.ts");

test("both pages ask for their data as loading starts, not after /v1/me", () => {
  assert.match(work, /enabled: ready,/);
  assert.doesNotMatch(work, /enabled: signedIn/);
  assert.match(project, /\[ready, id\]/);
  assert.doesNotMatch(project, /signedIn\.value/);
});

test("the work page reads its conversation beside its context, through one cache entry", () => {
  assert.match(work, /prefetch\(`\/hub\/w\/\$\{which\}`\)/);
  assert.match(thread, /fetchQuery\(\{ \.\.\.reads\.thread\(props\.id\)/);
});

test("a project's README comes with the project, not in a second request", () => {
  assert.match(project, /loadReadme\(got\?\.readme\)/);
});

test("pointing at a link to work or a project starts reading it", () => {
  assert.match(shell, /addEventListener\("pointerover", onPoint/);
  assert.match(shell, /addEventListener\("focusin", onPoint\)/);
  assert.match(hub, /\/\^\\\/hub\\\/w\\\/\(\[\^\/\?#\]\+\)\//);
  assert.match(hub, /\/\^\\\/hub\\\/projects\\\/\(\[\^\/\?#\]\+\)\//);
});
