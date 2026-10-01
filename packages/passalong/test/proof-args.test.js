// `passalong works <id> <screenshot.png...> [what you checked]`: which words are screenshots.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { proofArgs } from "../src/passalong.js";

test("an argument naming an image file that exists is a screenshot; the rest is the note", () => {
  const dir = mkdtempSync(join(tmpdir(), "proof-"));
  const shot = join(dir, "paid.png");
  writeFileSync(shot, "x");
  assert.deepEqual(proofArgs([shot, "checkout", "goes", "through"]), {
    images: [shot],
    note: "checkout goes through",
  });
});

test("a word that only looks like an image name stays in the note", () => {
  assert.deepEqual(proofArgs(["fixed", "logo.png", "rendering"]), {
    images: [],
    note: "fixed logo.png rendering",
  });
});
