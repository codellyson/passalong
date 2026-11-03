// The theme a reader chose holds on pages that hydrate. The `theme` cookie is HttpOnly, so reading
// it in the browser comes back empty: app.vue's head was re-rendered without `data-theme` after
// hydration, and the hub fell back to the system's theme whatever the switch said (2026-11-03).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const app = read("../app/app.vue");
const toggle = read("../app/components/AppThemeToggle.vue");
const route = read("../server/routes/theme.get.ts");

test("the cookie stays HttpOnly, so the browser cannot read it", () => {
  assert.match(route, /httpOnly: true/);
});

test("<html> takes the choice from the payload, the same state the switch reads", () => {
  const state = 'useState<string | undefined>("theme:choice", () => cookie.value)';
  assert.ok(app.includes(state), "app.vue carries it in the payload");
  assert.ok(toggle.includes(state), "and the switch reads the same state");
  assert.match(app, /"data-theme": computed\(\(\) =>\s*theme\.value === "light"/);
  assert.doesNotMatch(app, /const theme = useCookie/, "not the cookie, which reads empty there");
});
