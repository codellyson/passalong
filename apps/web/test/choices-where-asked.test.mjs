// An agent's question with options is answered where it reaches you: on Needs you and the work's
// page, not only behind Reply (2026-11-06).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const needs = read("../app/pages/hub/index.vue");
const work = read("../app/pages/hub/w/[id].vue");
const choices = read("../app/components/hub/Choices.vue");

test("Needs you offers the options on the lead and on each row", () => {
  assert.match(
    needs,
    /<HubChoices v-if="lead\.choices\?\.length" :id="lead\.id" :choices="lead\.choices" \/>/,
  );
  assert.match(needs, /v-if="r\.choices\?\.length && r !== lead"/);
});

test("the work's page shows the question waiting on you, with its options", () => {
  assert.match(work, /r\.id === id\.value && r\.reason === "asking" && r\.choices\?\.length/);
  assert.match(work, /<HubChoices :id="openAsk\.id" :choices="openAsk\.choices" \/>/);
});

test("a pick is the reply, said back, and Needs you is read again", () => {
  assert.match(
    choices,
    /await onReply\(props\.id, `I choose option \$\{n \+ 1\}: \$\{c\.label\}`\);/,
  );
  assert.match(choices, /await refresh\(hubKeys\.needs\);/);
  assert.match(
    choices,
    /You chose <b class="font-medium">\{\{ picked \}\}<\/b>\. The agent carries on with it\./,
  );
});

test("a pick on Needs you is confirmed in the corner, since its row leaves at once", () => {
  // Found testing live (2026-11-06): the row vanished on the tap with no word that it worked.
  assert.match(
    choices,
    /toast\(\{\s*text: `You chose \$\{c\.label\}\. The agent carries on with it\.`/,
  );
  assert.match(
    read("../app/composables/useLive.ts"),
    /return \{ toasts, dismiss, start, toast \};/,
  );
});
