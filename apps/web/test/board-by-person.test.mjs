// By person: the Work board's column per teammate and group, back as an opt-in. It was the default
// (2026-10-16) until it scrolled sideways for any team of more than a few (2026-11-02).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const work = read("../app/pages/hub/work.vue");
const board = read("../app/components/hub/Board.vue");

test("By person is a box beside Only mine, off by default, kept in the address", () => {
  assert.match(work, /get: \(\) => route\.query\.by === "person"/, "off unless ?by=person");
  assert.match(work, /setQuery\(\{ by: on \? "person" : undefined \}\)/);
  assert.match(work, /<input v-model="byPerson" type="checkbox" \/>\s*By person/);
  assert.match(work, /:by-person="byPerson && Boolean\(people\)"/, "only on one team's board");
});

test("its columns are To do's groups, between To do and In progress; To do keeps anyone's", () => {
  assert.match(
    board,
    /groupsOfTodo\(false\)\.filter\(\(x\) => x\.key !== ""\)/,
    "never a column mid-drag",
  );
  assert.match(
    board,
    /\[\.\.\.props\.columns\.slice\(0, at\), todo, \.\.\.people, \.\.\.props\.columns\.slice\(at \+ 1\)\]/,
  );
  assert.match(board, /const anyone = todoGroups\.value\.find\(\(x\) => x\.key === ""\)\?\.cards/);
  // A drop on someone's column gives the card to them, through the same act as their group.
  assert.match(board, /c\.lane === undefined \? drop\(c\.id\) : groupDrop\(c\.lane, e\)/);
});

test("the four-column board is untouched when it is off, and a phone's tabs always reach Done", () => {
  assert.match(board, /if \(!props\.byPerson\) return props\.columns;/);
  assert.match(board, /role="tablist" aria-label="Board columns" class="[^"]*\boverflow-x-auto\b/);
  assert.match(board, /class="tab [^"]*\bshrink-0\b[^"]*\bwhitespace-nowrap\b/);
});
