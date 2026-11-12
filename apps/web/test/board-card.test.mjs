// A board card's height is capped by its lines, not left to its words. An agent's progress note ran
// to seven lines and a project's long name to three, so one card stood a page tall.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const card = readFileSync(new URL("../app/components/hub/BoardCard.vue", import.meta.url), "utf8");

test("the title is three lines at most, the In progress line two, the project name one", () => {
  assert.match(card, /class="line-clamp-3 [^"]*"/, "the title, as before");
  const working = card.slice(card.indexOf("v-if=\"g.stage === 'working' && lead\""));
  assert.match(
    working.slice(0, 300),
    /class="m-0 line-clamp-2 /,
    "a long note cannot stretch the card",
  );
  assert.match(working.slice(0, 400), /:title="lead\.note \?/, "the whole note on hover");
  // The project is a chip (HubProjectChip) that keeps its name to one line and says it whole on hover.
  assert.match(card, /<HubProjectChip v-if="g\.project" :project="g\.project" :title="g\.project\.title" \/>/);
  const chip = readFileSync(new URL("../app/components/hub/ProjectChip.vue", import.meta.url), "utf8");
  assert.match(chip, /<span class="min-w-0 truncate">\{\{ project\.title \}\}<\/span>/);
  assert.doesNotMatch(card, /break-words">\{\{ g\.project\.title/, "the project name never wraps");
});
