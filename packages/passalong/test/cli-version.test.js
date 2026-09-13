import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const version = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
const bin = fileURLToPath(new URL("../bin/passalong", import.meta.url));

/** The real binary, with a home of its own and no token, so nothing here can touch an account. */
const run = (...args) =>
  spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PASSALONG_HOME: mkdtempSync(join(tmpdir(), "passalong-v-")),
      PASSALONG_TOKEN: "",
    },
  });

// The first thing someone runs when a feature is missing is "which version do I have" — and every
// one of these used to print the help page, which answers a different question.
test("-v, --version and `version` all print the installed version", () => {
  for (const args of [["-v"], ["--version"], ["version"]]) {
    const r = run(...args);
    assert.equal(r.status, 0, `passalong ${args.join(" ")} should exit 0`);
    // Only the number on stdout, so a script can compare it against `npm view passalong version`.
    assert.equal(r.stdout.trim(), version, `passalong ${args.join(" ")} should print ${version}`);
  }
});

test("help still answers for no command at all", () => {
  const r = run();
  assert.equal(r.status, 0);
  assert.match(`${r.stdout}${r.stderr}`, /passalong version/);
});
