// By person: the Work board's column per teammate and group. It was the default (2026-10-16), then
// an opt-in when it scrolled sideways for any team of more than a few (2026-11-02), and is the
// default again (2026-11-04): who has what is the first thing a team looks for.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const work = read("../app/pages/hub/work.vue");
const board = read("../app/components/hub/Board.vue");

test("By person is a box beside Only mine, on by default, turned off in the address", () => {
  assert.match(work, /get: \(\) => route\.query\.by !== "status"/, "on unless ?by=status");
  assert.match(
    work,
    /flip\(\{ by: on \? undefined : "status" \}\)/,
    "and remembered (utils/board-view.ts)",
  );
  assert.match(work, /<input v-model="byPerson" type="checkbox" \/>\s*By person/);
  assert.match(work, /:by-person="byPerson && Boolean\(people\)"/, "only on one team's board");
});

test("its columns are Ready's groups, between Ready and In progress; Ready keeps anyone's", () => {
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
  assert.match(board, /c\.lane === undefined \? c\.id : `group:\$\{c\.lane\}`/);
  assert.match(
    board,
    /key\.startsWith\("group:"\) \? giveTo\(g, key\.slice\(6\)\) : moveTo\(g, key\)/,
  );
});

test("a card is dragged by the pointer: it lifts, the board makes room, and it slides into place", () => {
  // 2026-11-11: the browser's own drag left a ghost, opened nothing, and the card sat faded in its
  // old column until the server answered.
  const card = readFileSync(
    new URL("../app/components/hub/BoardCard.vue", import.meta.url),
    "utf8",
  );
  assert.match(card, /@pointerdown="emit\('grab', \$event\)"/);
  assert.match(card, /@dragstart\.prevent/, "the link's own drag is refused");
  assert.doesNotMatch(board, /@dragover|@drop|dataTransfer/);
  assert.match(board, /class="drop-gap"/);
  assert.match(board, /requestAnimationFrame\(autoScroll\)/);
  assert.match(board, /prefers-reduced-motion: reduce/);
});

test("the four-column board is untouched when it is off, and a phone's tabs always reach Done", () => {
  assert.match(board, /if \(!props\.byPerson\) return props\.columns;/);
  assert.match(board, /role="tablist" aria-label="Board columns" class="[^"]*\boverflow-x-auto\b/);
  assert.match(board, /class="tab [^"]*\bshrink-0\b[^"]*\bwhitespace-nowrap\b/);
});
