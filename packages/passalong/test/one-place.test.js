// A field with a default has one place that applies it.
//
// `kind` was absent-means-transfer, and six files each decided that for themselves — one of them
// decided `task`. No single edit was wrong; the shape was. A field whose absence means something
// gets re-interpreted by every new reader, and the interpretations drift apart quietly, because
// nothing fails when they disagree.
//
// So the rule is not "kind has a default". It is: **the default is applied at the boundary, the
// answer is written into the record, and nothing downstream may apply it again.** The boundary is
// `parseFrontmatter` in src/guide.js and `parseMeta` in apps/api/src/guide.ts, which mirrors it.
//
// This test is what makes that a rule rather than a comment. It reads the source — the way
// oauth.test.mjs holds the internal-call marker and guide.test.mjs holds the notify rule — and
// fails when a defaulted field grows a second opinion somewhere else. Add a field to GUARDED when
// it becomes one that absence speaks for.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Where the defaults are allowed to live: the format, and the mirror of it. */
const BOUNDARY = ["packages/passalong/src/guide.js", "apps/api/src/guide.ts"];

/**
 * Fields whose absence means something, and the shapes that mean somebody decided it again.
 *
 * The patterns are deliberately about the *value*, not the field name: `|| "transfer"` is the
 * decision, wherever it is written and whatever it is assigned to. A comparison is not a decision
 * — `kind === "bug"` asks a question and is everywhere on purpose.
 */
const GUARDED = [{ field: "kind", values: ["transfer", "bug", "task"] }];

const SOURCE = [
  "packages/passalong/src",
  "packages/passalong/bin",
  "apps/api/src",
  "apps/web/app",
  "apps/web/server",
];

/**
 * The code, without the prose.
 *
 * This repo explains itself in comments, at length and on purpose, so a guard that cannot tell a
 * line of code from a line about code would forbid writing down the very rule it enforces — the
 * first run of this test failed on two comments saying what used to be there. Strings are left
 * alone: a default is a string literal, and blanking them would blind the check to every case it
 * exists to catch.
 *
 * Deliberately not a parser. Missing an offence written in some shape this does not follow is a
 * gap; flagging a sentence is what makes people delete the test.
 */
function code(src) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      if (c === "\\") {
        out += c + (next ?? "");
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      out += c;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Every source file under a directory, skipping build output and anything not hand-written. */
function files(dir) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === "node_modules" || name === ".output" || name === ".nuxt" || name === "dist")
        continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|ts|mjs|vue)$/.test(name) || !name.includes(".")) out.push(full);
    }
  };
  walk(join(root, dir));
  return out;
}

test("a defaulted field is defaulted in one place", () => {
  const allowed = new Set(BOUNDARY.map((p) => join(root, p)));
  const offences = [];

  for (const dir of SOURCE) {
    for (const file of files(dir)) {
      if (allowed.has(file)) continue;
      const src = code(readFileSync(file, "utf8"));
      for (const { field, values } of GUARDED) {
        for (const value of values) {
          // `|| "transfer"` and `?? "transfer"`, with any spacing.
          const re = new RegExp(`(\\|\\||\\?\\?)\\s*["'\`]${value}["'\`]`, "g");
          for (const m of src.matchAll(re)) {
            const line = src.slice(0, m.index).split("\n").length;
            offences.push(`${relative(root, file)}:${line}  ${m[0]}  (${field})`);
          }
        }
      }
    }
  }

  assert.deepEqual(
    offences,
    [],
    "A default applied outside the boundary is a second opinion about what absence means.\n" +
      "Read it at the boundary instead — parseFrontmatter in src/guide.js, parseMeta in\n" +
      "apps/api/src/guide.ts — and let the value travel. If the fallback is really an\n" +
      "invariant of the caller rather than a default (the task queue only ever hands out\n" +
      "tasks, say), write that down where it is and give the constant a different shape.\n\n" +
      `Found:\n  ${offences.join("\n  ")}`,
  );
});

test("the boundary still applies the defaults it owns", () => {
  // The guard above is only worth having while the boundary is doing the work. If the seeding is
  // deleted, every reader goes back to deciding for itself and this suite would sit there green.
  const js = readFileSync(join(root, "packages/passalong/src/guide.js"), "utf8");
  const ts = readFileSync(join(root, "apps/api/src/guide.ts"), "utf8");
  for (const [name, src] of [
    ["guide.js", js],
    ["guide.ts", ts],
  ])
    assert.match(
      src,
      /meta\.kind = "transfer"/,
      `${name} must seed kind, or nothing does and everything guesses again`,
    );
});
