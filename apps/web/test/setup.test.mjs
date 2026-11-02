// First-run setup: where it resumes, what is left, and the README written from a person's answers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readmeAsk } from "../app/utils/asks.ts";
import {
  answered,
  draftBody,
  leftOf,
  NO_SETUP,
  needsSetup,
  newDraft,
  readmeFromAnswers,
  resumeAt,
  toneForName,
  typed,
} from "../app/utils/setup.ts";

test("setup resumes at the first step not answered, then at the first one skipped", () => {
  assert.equal(resumeAt(NO_SETUP), "team");
  assert.equal(resumeAt({ ...NO_SETUP, done: ["team"], skipped: ["people"] }), "groups");
  const all = ["team", "people", "groups", "projects", "know", "inbox"];
  const s = { ...NO_SETUP, done: all, skipped: ["agents"] };
  assert.equal(answered(s), true);
  assert.equal(resumeAt(s), "agents");
  assert.deepEqual(
    leftOf(s).map((x) => x.id),
    ["agents"],
  );
});

test("the README keeps the person's words and leaves out what they did not answer", () => {
  const md = readmeFromAnswers("Billing app", {
    what: "Where customers pay us.",
    who: "",
    words: "- Plan: what a customer pays for\n\nSeat: one person on a plan\n",
  });
  assert.equal(
    md,
    "# Billing app\n\nWhere customers pay us.\n\n## Words we use\n\n- Plan: what a customer pays for\n- Seat: one person on a plan\n",
  );
});

test("a draft writes the README from the way chosen, and nothing when that way is empty", () => {
  const d = { ...newDraft(), who: "Shop owners" };
  assert.equal(typed(d), true);
  assert.equal(draftBody("Site", d), "# Site\n\n## Who uses it\n\nShop owners\n");
  assert.equal(
    draftBody("Site", d, "Where shops hear of us"),
    "# Site\n\nWhere shops hear of us\n\n## Who uses it\n\nShop owners\n",
  );
  assert.equal(typed({ ...d, how: "paste" }), false);
  assert.equal(draftBody("Site", { ...d, how: "paste", pasted: " Our pitch. " }), "Our pitch.\n");
});

test("only a teamless account that never touched setup is sent to it", () => {
  assert.equal(needsSetup({ teams: [], setup: NO_SETUP }), true);
  assert.equal(needsSetup({ teams: [{}], setup: NO_SETUP }), false);
  assert.equal(needsSetup({ teams: [], setup: { ...NO_SETUP, skipped: ["team"] } }), false);
  assert.equal(needsSetup({ teams: [], setup: { ...NO_SETUP, dismissed: true } }), false);
  assert.equal(needsSetup({ teams: [] }), false);
});

test("a project's tone follows its name, is never coral, and the ask names the repo first", () => {
  assert.equal(toneForName("Billing app"), toneForName(" billing app "));
  assert.notEqual(toneForName("Billing app"), "coral");
  assert.match(
    readmeAsk({ id: "f1", title: "Site", repo: "github.com/acme/site" }),
    /^Read the repo github\.com\/acme\/site and write the README for the Passalong project "Site" \(f1\)/,
  );
  assert.match(readmeAsk({ id: "f1", title: "Site" }), /^Write the README/);
});
