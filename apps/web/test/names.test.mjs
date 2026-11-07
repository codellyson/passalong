// Who someone is, from the first screen: sign-up keeps saying it is working until the hub is up,
// and an account with no name is asked for one on Needs you (2026-11-07).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../app/${p}`, import.meta.url), "utf8");

test("signing up stays busy until the hub replaces the form, and never sticks", () => {
  const src = read("components/hub/SignIn.vue");
  assert.match(src, /const sending = computed\(\(\) => requesting\.value \|\| arriving\.value\)/);
  assert.match(src, /arriving\.value = true;[\s\S]*emit\("signedIn"\)/, "set before the hub loads");
  assert.match(
    src,
    /setTimeout\(\(\) => \(arriving\.value = false\)/,
    "and let go if it never does",
  );
});

test("an account with no name is asked for one on Needs you, and only then", () => {
  const note = read("components/hub/NameNote.vue");
  assert.match(note, /!me\.value\?\.name\?\.trim\(\)/);
  assert.match(note, /What should people call you\?/);
  assert.match(read("pages/hub/index.vue"), /<HubNameNote \/>/);
});
