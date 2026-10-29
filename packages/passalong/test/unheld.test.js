import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Isolated before the modules load: the store resolves its home once, and work goes to a fake
// server rather than a live account.
const HOME = mkdtempSync(join(tmpdir(), "passalong-unheld-"));
process.env.PASSALONG_HOME = HOME;
const { fakeServer } = await import("./fake-server.js");
const server = fakeServer();
const { publish } = await import("../src/passalong.js");

// The shape that found this: a design.md, whose tokens are nested maps in its frontmatter.
const DESIGN = `---
title: Supabase design system
summary: Said to a person for the test.
colors:
  primary: "#3ECF8E"
typography:
  display:
    fontSize: 72px
---

Dark-first, hairline borders.
`;

test("publish refuses frontmatter it would empty, naming each field, and stores nothing", async () => {
  await assert.rejects(
    () => publish(DESIGN),
    (err) => {
      assert.match(err.message, /frontmatter "colors" holds more than a string/);
      assert.match(err.message, /frontmatter "typography" holds more than a string/);
      assert.match(err.message, /fenced yaml block/);
      return true;
    },
  );
  const stored = readdirSync(HOME, { recursive: true }).filter((f) => String(f).endsWith(".md"));
  assert.deepEqual(stored, []);
  assert.equal(server.guides.size, 0, "and sends nothing");
});

test("the same content moved into the body is sent, and keeps every line", async () => {
  const md = `---\ntitle: Supabase design system\nsummary: Said to a person for the test.\n---\n\n\`\`\`yaml\ncolors:\n  primary: "#3ECF8E"\n\`\`\`\n`;
  const { guide } = await publish(md);
  assert.match(guide.body, /primary: "#3ECF8E"/);
});
