import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("the cutover can pause deployment and builds before changing production data", () => {
  const workflow = readFileSync(
    new URL("../../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const deploy = workflow.slice(workflow.indexOf("\n  deploy:"));
  assert.match(deploy, /&& vars\.PAUSE_DEPLOY != 'true'/);
  const build = deploy.indexOf("run: pnpm -C apps/web build");
  const migrate = deploy.indexOf("run: pnpm -C apps/api db:migrate:remote");
  assert.ok(build >= 0 && migrate > build);
});

test("deployment smoke check accepts only an unauthenticated 401", () => {
  const workflow = readFileSync(
    new URL("../../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const command = workflow.split("\n").find((line) => line.includes("https://passalong.dev/v1/me"));
  assert.ok(command);
  for (const [status, exit] of [
    ["401", 0],
    ["200", 0],
    ["403", 0],
    ["500", 0],
    ["000", 7],
    ["401", 18],
  ]) {
    const result = spawnSync(
      "bash",
      [
        "-eo",
        "pipefail",
        "-c",
        `curl() {
          printf '%s' "$STATUS"
          case "$*" in *-f*) return 22 ;; esac
          return "$CURL_EXIT"
        }
        ${command}`,
      ],
      { env: { ...process.env, STATUS: status, CURL_EXIT: String(exit) } },
    );
    assert.equal(
      result.status === 0,
      status === "401" && exit === 0,
      `HTTP ${status}, curl ${exit}`,
    );
  }
});
