// The "On this page" list: ids that link, stay unique, and can't name a global.
import assert from "node:assert/strict";
import test from "node:test";
import "./aliases.mjs";

const { outline } = await import("../app/utils/doc-outline.ts");

test("h2 and h3 get prefixed ids and become the list, in order", () => {
  const { html, items } = outline(
    "<h2>Getting started</h2><p>x</p><h3>Install &amp; run</h3><h4>Deep</h4>",
  );
  assert.deepEqual(items, [
    { id: "sec-getting-started", label: "Getting started", level: 2 },
    { id: "sec-install-run", label: "Install & run", level: 3 },
  ]);
  assert.match(html, /<h2 id="sec-getting-started">Getting started<\/h2>/);
  assert.match(html, /<h4>Deep<\/h4>/);
});

test("repeated headings stay unique, and markup inside a heading is read as text", () => {
  const { items } = outline("<h2>Notes</h2><h2>Notes</h2><h2><code>take</code> it</h2>");
  assert.deepEqual(
    items.map((i) => i.id),
    ["sec-notes", "sec-notes-2", "sec-take-it"],
  );
});

test("an id the heading already has is kept, and odd text still makes a safe id", () => {
  const { items, html } = outline(
    '<h2 id="mine">Kept</h2><h2>"><script>alert(1)</script></h2><h2>★★★</h2>',
  );
  assert.equal(items.length, 2);
  for (const i of items) assert.match(i.id, /^sec-[a-z0-9-]+$/);
  assert.match(html, /<h2 id="mine">Kept<\/h2>/);
});
