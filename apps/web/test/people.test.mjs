// The initials and the colour behind them. Both are derived from the name, so the same person is
// the same two letters and the same colour everywhere they appear.
import assert from "node:assert/strict";
import { test } from "node:test";
import { avatarHue, initialsOf } from "../app/utils/people.ts";

test("initials are the first letters of a name, or the first two of a single word", () => {
  assert.equal(initialsOf("Jed Ogwumike"), "JO");
  assert.equal(initialsOf("Ada"), "AD");
  assert.equal(initialsOf("@7kef2w7gbd"), "7K", "the @ is not a letter");
  assert.equal(initialsOf("mary jane watson"), "MJ", "two, never three");
  assert.equal(initialsOf(""), "?");
  assert.equal(initialsOf("  "), "?");
});

test("the colour is the person's, steady across sessions and spread around the wheel", () => {
  const hue = avatarHue("Jed Ogwumike");
  assert.equal(hue, avatarHue("Jed Ogwumike"), "the same name is the same colour every time");
  assert.notEqual(hue, avatarHue("Ada Okafor"));
  const hues = ["Ada", "Bo", "Jed", "Mary", "Sam", "Tolu"].map(avatarHue);
  for (const h of hues) assert.ok(h >= 0 && h < 360, `${h} is a hue`);
  assert.ok(new Set(hues).size >= 5, "six people do not collapse onto one colour");
});
