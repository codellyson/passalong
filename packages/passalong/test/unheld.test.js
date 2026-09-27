import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Isolated before the modules load: the store resolves its home once, and a real token would turn
// these offline shares into writes against a live account.
const HOME = mkdtempSync(join(tmpdir(), "passalong-unheld-"));
process.env.PASSALONG_HOME = HOME;
delete process.env.PASSALONG_TOKEN;
const { share } = await import("../src/passalong.js");

// The shape that found this: a design.md, whose tokens are nested maps in its frontmatter.
const DESIGN = `---
title: Supabase design system
kind: transfer
colors:
  primary: "#3ECF8E"
typography:
  display:
    fontSize: 72px
---

Dark-first, hairline borders.
`;

test("share refuses frontmatter it would empty, naming each field, and stores nothing", async () => {
  await assert.rejects(
    () => share(DESIGN),
    (err) => {
      assert.match(err.message, /frontmatter "colors" holds more than a string/);
      assert.match(err.message, /frontmatter "typography" holds more than a string/);
      assert.match(err.message, /fenced yaml block/);
      return true;
    },
  );
  const stored = readdirSync(HOME, { recursive: true }).filter((f) => String(f).endsWith(".md"));
  assert.deepEqual(stored, []);
});

test("the same content moved into the body shares, and keeps every line", async () => {
  const md = `---\ntitle: Supabase design system\nkind: transfer\n---\n\n\`\`\`yaml\ncolors:\n  primary: "#3ECF8E"\n\`\`\`\n`;
  const { guide } = await share(md);
  assert.match(guide.body, /primary: "#3ECF8E"/);
});
