// A rail row is one 32px line (DESIGN.md, the rail). A project's name used to wrap, so one long name
// — "Merchant payments: dedicated accounts & WhatsApp alerts (FR-03, FR-04)" — took three rows.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const rail = readFileSync(new URL("../app/components/hub/Sidebar.vue", import.meta.url), "utf8");

test("a project's name in the rail is one line, cut with an ellipsis, whole on hover", () => {
  const row = rail.slice(rail.indexOf('<li v-for="p in projects"'), rail.indexOf("</li>"));
  assert.match(
    row,
    /<span class="[^"]*\btruncate\b[^"]*" :title="p\.title">\{\{ p\.title \}\}<\/span>/,
  );
  assert.doesNotMatch(row, /break-words/, "it never wraps");
  assert.match(row, /<span v-if="p\.open" class="shrink-0 /, "and the count is never squeezed");
});
