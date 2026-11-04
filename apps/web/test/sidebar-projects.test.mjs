// A rail row is one 32px line (DESIGN.md, the rail). A project's name used to wrap, so one long name
// — "Merchant payments: dedicated accounts & WhatsApp alerts (FR-03, FR-04)" — took three rows.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const rail = readFileSync(new URL("../app/components/hub/Sidebar.vue", import.meta.url), "utf8");

test("a project's name in the rail is one line, cut with an ellipsis, whole on hover", () => {
  const at = rail.indexOf('<li v-for="p in projects"');
  const row = rail.slice(at, rail.indexOf("</li>", at));
  assert.match(
    row,
    /<span class="[^"]*\btruncate\b[^"]*" :title="p\.title">\{\{ p\.title \}\}<\/span>/,
  );
  assert.doesNotMatch(row, /break-words/, "it never wraps");
  assert.match(row, /<span v-if="p\.open" class="shrink-0 /, "and the count is never squeezed");
});

test("top to bottom: the box, the places together, then the projects taking the rest", () => {
  const nav = rail.slice(rail.indexOf('<nav class="'), rail.indexOf("</nav>"));
  const order = [
    'to="/hub/new"',
    'to="/hub"',
    'to="/hub/work"',
    'to="/hub/support"',
    'id="rail-projects"',
  ];
  const at = order.map((x) => nav.indexOf(x));
  assert.ok(
    at.every((n) => n >= 0),
    "each is on the rail",
  );
  assert.deepEqual(
    [...at].sort((a, b) => a - b),
    at,
    order.join(" < "),
  );
  assert.match(
    nav,
    /<section aria-labelledby="rail-projects" class="[^"]*\bflex-1\b/,
    "and scroll in it",
  );
});
