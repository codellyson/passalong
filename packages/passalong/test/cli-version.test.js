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

// A command this build does not have is the shape of "you are on an older passalong": the feature
// is in the docs, the binary is not. Printing the help page for it read as "that command exists
// and did nothing", which sent people looking for the bug in the wrong place.
test("an unknown command says so, and says what to check", () => {
  // A name no build will ever have, standing in for one an older build does not have yet.
  const r = run("gift-the-whole-team", "team/acme", "--until", "2027-09-23");
  assert.equal(r.status, 1, "it fails rather than printing help and exiting 0");
  assert.equal(r.stdout, "", "nothing on stdout: a script reading this is not handed a help page");
  assert.match(r.stderr, /unknown command "gift-the-whole-team"/);
  assert.match(r.stderr, /passalong help/);
  // The likeliest cause when the command is in the docs and not in the binary: an older install.
  assert.match(r.stderr, new RegExp(`This is passalong ${version.replace(/\./g, "\\.")}`));
  assert.match(r.stderr, /npm i -g passalong/);
});
