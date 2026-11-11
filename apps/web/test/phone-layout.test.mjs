// The hub at phone width (2026-11-06). Looked at on a 375-point screen: the bulk bar broke over
// three ragged rows, the board's filters took most of the first screen, the board opened on an
// empty column, the plan notices squeezed their sentences beside their links, and each Needs you
// row gave a third of its width to a button that did what its title already did.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../app/${p}`, import.meta.url), "utf8");
const bar = read("components/hub/BulkBar.vue");
const board = read("components/hub/Board.vue");
const work = read("pages/hub/work.vue");
const shell = read("components/hub/Shell.vue");
const needs = read("pages/hub/index.vue");

test("the bulk bar is one row on a phone, each act an icon over a short word", () => {
  assert.match(bar, /max-sm:flex-nowrap max-sm:justify-between/);
  assert.match(bar, /max-sm:!flex-col/);
  for (const word of ["Give", "Move", "Archive"])
    assert.match(bar, new RegExp(`<span class="sm:hidden">${word}</span>`), word);
  // The count still says what it counts, to a screen reader.
  assert.match(bar, /<span class="max-sm:sr-only">selected<\/span>/);
});

test("on a phone the board's filters fold behind one button that counts the ones set", () => {
  assert.match(
    work,
    /id="board-filters" class="contents" :class="filtersOpen \? '' : 'max-md:hidden'"/,
  );
  assert.match(work, /aria-controls="board-filters"/);
  assert.match(work, /class="btn shrink-0 md:hidden"/);
  assert.match(work, /v-if="filtersOn"/);
  // Wide, search stays at the end of the one row, as before.
  assert.match(work, /md:order-last md:ml-auto md:w-64/);
});

test("a phone opens the board on the first column with work waiting, people's columns included", () => {
  assert.match(board, /c\.id === "todo" \|\| c\.lane !== undefined/);
  assert.doesNotMatch(board, /col\("todo"\)\.cards\.length \? "todo"/);
});

test("a notice's links get a line of their own on a phone, lined up with its text", () => {
  assert.match(
    shell,
    /const acts = "flex shrink-0 flex-wrap gap-x-3 max-sm:basis-full max-sm:pl-\[1\.125rem\]"/,
  );
  assert.doesNotMatch(shell, /<NuxtLink[^>]*class="shrink-0 font-medium"/);
});

test("on a phone a Needs you row opens from anywhere on it, with no button beside the title", () => {
  assert.match(needs, /@max-md:after:absolute @max-md:after:inset-0/);
  // Every row's act is `actCls`, one string the template binds.
  assert.match(needs, /const actCls =\s*"btn sm order-1 shrink-0 @max-md:hidden/);
  assert.doesNotMatch(needs, /:class="(?!actCls)[^"]*\bbtn sm order-1/);
});
