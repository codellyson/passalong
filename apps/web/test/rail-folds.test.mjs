// The hub's rail folds to a strip of icons on a desktop, giving the page the room (2026-11-06).
// Remembered in a cookie so the server draws it folded; a phone's drawer never folds.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const shell = read("../app/components/hub/Shell.vue");
const rail = read("../app/components/hub/Sidebar.vue");
const account = read("../app/components/hub/AccountMenu.vue");

test("the choice is a cookie, so the page is drawn folded from the server", () => {
  assert.match(shell, /const railSmall = useCookie<boolean>\("rail-small"/);
  assert.match(
    shell,
    /railSmall \? 'md:grid-cols-\[3\.75rem_minmax\(0,1fr\)\]' : 'md:grid-cols-\[15rem_minmax\(0,1fr\)\]'/,
  );
  assert.match(shell, /<HubSidebar :small="railSmall" @toggle="railSmall = !railSmall" \/>/);
});

test("folding is desktop only: everything it hides is md:, and the toggle is not on a phone", () => {
  assert.match(rail, /const hide = computed\(\(\) => \(props\.small \? "md:sr-only" : ""\)\);/);
  assert.match(rail, /class="hidden cursor-pointer border-0 bg-transparent text-left md:flex"/);
  assert.match(rail, /:aria-label="small \? 'Expand the sidebar' : 'Collapse the sidebar'"/);
});

test("folded, every place names itself on hover, and nothing is lost", () => {
  for (const name of ["Needs you", "Work", "Support", "Settings", "New"])
    assert.match(rail, new RegExp(`:title="tip\\('${name}'\\)"`), name);
  // The count stays as a badge; each project keeps its line and first letter.
  assert.match(rail, /md:absolute md:top-0 md:right-1 md:rounded-full md:bg-coral/);
  assert.match(rail, /p\.title\.trim\(\)\.charAt\(0\)\.toUpperCase\(\)/);
  assert.match(account, /:class="props\.small \? 'md:hidden' : ''">\{\{ label \}\}<\/span>/);
});

test("Go to is a search icon when folded, and ⌘K opens the rail into it", () => {
  assert.match(rail, /title="Go to… \(⌘K\)"/);
  assert.match(
    rail,
    /if \(props\.small && \(e\.metaKey \|\| e\.ctrlKey\) && e\.key\.toLowerCase\(\) === "k"\) openGoTo\(\);/,
  );
  assert.match(rail, /document\.querySelector<HTMLInputElement>\("#hub-goto"\)\?\.focus\(\);/);
});
