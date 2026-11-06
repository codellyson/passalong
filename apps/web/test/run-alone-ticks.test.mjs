// Ticking work Safe to run alone, for the runner (`passalong work --watch`), was only on each
// work's own page, one at a time (2026-11-06). Now the board shows what is ticked, each card's menu
// ticks it, and the bulk bar ticks many at once.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const bulk = read("../app/components/hub/BulkBar.vue");
const menu = read("../app/components/hub/CardMenu.vue");
const card = read("../app/components/hub/BoardCard.vue");
const hub = read("../app/composables/useHub.ts");
const api = read("../../api/src/index.ts");

test("the board's work says whether it is ticked", () => {
  assert.match(api, /alone: Boolean\(r\.alone\),/);
  assert.match(card, /<span v-if="g\.alone && !done"[^>]*>· Runs alone<\/span>/);
});

test("the bulk bar ticks and unticks many at once, asking first", () => {
  assert.match(
    bulk,
    /const toAlone = computed\(\(\) => props\.picked\.filter\(\(g\) => g\.status !== "done" && !g\.alone\)\);/,
  );
  assert.match(bulk, /<AppIcon name="run" \/><span class="max-sm:hidden">Run alone…<\/span>/);
  assert.match(bulk, /@click="alone\(true\)">Mark safe to run alone \(\{\{ toAlone\.length \}\}\)/);
  assert.match(bulk, /@click="alone\(false\)">Unmark \(\{\{ fromAlone\.length \}\}\)/);
  assert.match(bulk, /act: \{ alone: true \}/);
  assert.match(hub, /api\(`\/v1\/work\/\$\{id\}\/alone`, json\("PUT", \{ on: act\.alone \}\)\)/);
});

test("each card's menu ticks it, as a checkbox the keyboard reaches", () => {
  assert.match(menu, /role="menuitemcheckbox"[\s\S]{0,120}:aria-checked="Boolean\(g\.alone\)"/);
  assert.match(
    menu,
    /const alone = \(\) => run\(\(\) => onBulk\(\[g\.value\.id\], \{ alone: !g\.value\.alone \}\)\);/,
  );
  assert.match(menu, /"\[role=menuitem\], \[role=menuitemcheckbox\]"/);
});
