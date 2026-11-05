// A paid team covers the work sent to it and nothing else (apps/api/src/quota.ts), so beside the
// count of your own work the hub says which teams' work isn't in it (2026-11-05).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { coveredLine, payingTeams } from "../app/utils/covered.ts";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("only teams on the Team plan now cover anything", () => {
  const me = {
    teams: [
      { name: "Khaime", plan: "team" },
      { name: "Side", plan: "free" },
      { name: "Old", plan: "lapsed" },
    ],
  };
  assert.deepEqual(payingTeams(me), ["Khaime"]);
  assert.deepEqual(payingTeams(undefined), []);
});

test("it is said for one team, for several, and not at all for none", () => {
  assert.equal(
    coveredLine(["Khaime"]),
    "Anything you send to Khaime doesn't count, because the team's plan covers it.",
  );
  assert.equal(
    coveredLine(["A", "B", "C"]),
    "Anything you send to A, B or C doesn't count, because those teams' plans cover it.",
  );
  assert.equal(coveredLine([]), "");
});

test("the plan page and the limit banner say it; nothing says a seat lifts the limit", () => {
  const solo = read("../app/components/hub/Solo.vue");
  assert.match(solo, /\{\{ covered \}\} Get Solo if you want no limit on your own work too\./);
  assert.doesNotMatch(solo, /onATeamSeat/);
  assert.match(
    read("../app/components/hub/Shell.vue"),
    /<template v-if="covered"> \{\{ covered \}\}<\/template>/,
  );
  assert.doesNotMatch(
    read("../app/pages/hub/settings/[[tab]].vue"),
    /In a paid team, so there's no limit/,
  );
});
