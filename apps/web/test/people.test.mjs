// The initials and the colour behind them. Both are derived from the name, so the same person is
// the same two letters and the same colour everywhere they appear.
import assert from "node:assert/strict";
import { test } from "node:test";
import { avatarHue, initialsOf, personChoices } from "../app/utils/people.ts";

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

// The /admin picker's rows. What goes in the field has to be exact; what is drawn beside it has to
// be enough to tell two accounts apart at a glance.
test("a person is their name, over the address the field will hold", () => {
  assert.deepEqual(
    personChoices([
      { id: "u5b5znfg9c", handle: "lukman", name: "Lukman Isiaka", email: "l@khaime.ai" },
    ]),
    [{ value: "@lukman", title: "Lukman Isiaka", hint: "@lukman \u00b7 l@khaime.ai" }],
  );
});

test("an account with no name is known by its address, and does not show it twice", () => {
  assert.deepEqual(
    personChoices([{ id: "qf23szz2e4", handle: "", name: "", email: "ops@example.test" }]),
    [{ value: "qf23szz2e4", title: "qf23szz2e4", hint: "ops@example.test" }],
  );
  assert.deepEqual(personChoices([{ id: "qf23szz2e4", handle: "", name: "", email: "" }]), [
    { value: "qf23szz2e4", title: "qf23szz2e4", hint: "" },
  ]);
});

test("a team carries its slug, because two teams can share a name", () => {
  assert.deepEqual(
    personChoices(
      [],
      [
        { slug: "khaime", name: "Khaime" },
        { slug: "khaime-2", name: "Khaime" },
      ],
    ),
    [
      { value: "team/khaime", title: "Khaime", hint: "team/khaime \u00b7 the whole team" },
      { value: "team/khaime-2", title: "Khaime", hint: "team/khaime-2 \u00b7 the whole team" },
    ],
  );
});

test("people come before teams, and nothing at all is an empty list", () => {
  const rows = personChoices(
    [{ id: "a1", handle: "ada", name: "Ada" }],
    [{ slug: "acme", name: "Acme" }],
  );
  assert.deepEqual(
    rows.map((r) => r.value),
    ["@ada", "team/acme"],
  );
  assert.deepEqual(personChoices(), []);
});
