import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTarget } from "../src/passalong.js";

test("--to keeps the sigil that says person or group", () => {
  assert.deepEqual(parseTarget("khaime"), { team: "khaime", to: undefined });
  assert.deepEqual(parseTarget("khaime/@hybee1"), { team: "khaime", to: "hybee1" });
  assert.deepEqual(parseTarget("khaime/hybee1"), { team: "khaime", to: "hybee1" });
  // The # travels into the frontmatter as written: it is what the server reads to tell a group
  // from a teammate, and stripping it would look for a person nobody is called.
  assert.deepEqual(parseTarget("khaime/#frontend"), { team: "khaime", to: "#frontend" });
  assert.deepEqual(parseTarget(""), {});
  assert.deepEqual(parseTarget("  khaime / #frontend "), { team: "khaime", to: "#frontend" });
});
