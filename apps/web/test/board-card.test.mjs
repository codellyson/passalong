// A board card's height is capped by its lines, not left to its words. An agent's progress note ran
// to seven lines and a project's long name to three, so one card stood a page tall.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const card = readFileSync(new URL("../app/components/hub/BoardCard.vue", import.meta.url), "utf8");

test("the title is three lines at most, the In progress line one, the project name one", () => {
  assert.match(card, /class="line-clamp-3 [^"]*"/, "the title, as before");
  const working = card.slice(card.indexOf("v-if=\"g.stage === 'working' && lead\""));
  assert.match(
    working.slice(0, 300),
    /class="m-0 flex min-w-0 items-center /,
    "one centred row: the state, the face and the name line up (2026-11-18)",
  );
  assert.match(working.slice(0, 400), /:title="lead\.note \?/, "the whole note on hover");
  assert.match(working, /class="hidden min-w-0 truncate @\[60rem\]:inline"/, "a long note is cut, never wrapped");
  // The project is a chip (HubProjectChip) that keeps its name to one line and says it whole on hover.
  assert.match(
    card,
    /<HubProjectChip v-if="g\.project" :project="g\.project" :title="g\.project\.title" \/>/,
  );
  const chip = readFileSync(
    new URL("../app/components/hub/ProjectChip.vue", import.meta.url),
    "utf8",
  );
  assert.match(chip, /<span class="min-w-0 truncate">\{\{ project\.title \}\}<\/span>/);
  assert.doesNotMatch(card, /break-words">\{\{ g\.project\.title/, "the project name never wraps");
});
