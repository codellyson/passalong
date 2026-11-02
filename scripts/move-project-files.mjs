#!/usr/bin/env node
// Moves every project file in R2 from `folders/<project>/<file>` to `projects/<project>/<file>`,
// the key apps/api/src/projects.ts reads. Run once at the 1.0 cutover, after migration 0068
// (it lists `project_file`) — docs/DEPLOY.md. Dry run by default; `--apply` acts.
//
//   node scripts/move-project-files.mjs            # prints what it would move
//   node scripts/move-project-files.mjs --apply    # copies, checks the copy, then deletes the old
//
// Idempotent: an object already at its new key is skipped, and the old one is deleted only after
// the copy has been read back and matches byte for byte. Never deletes on doubt.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUCKET = "passalong-shots"; // apps/web/wrangler.jsonc, binding SHOTS
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Each row's old key and new key. Pure, so the test can hold it. */
export const plan = (rows) =>
  rows.map((r) => ({
    from: `folders/${r.project_id}/${r.id}`,
    to: `projects/${r.project_id}/${r.id}`,
  }));

const wrangler = (args) =>
  execFileSync("npx", ["wrangler", ...args], {
    cwd: join(root, "apps/web"),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

/** The object's bytes, or null when wrangler cannot fetch it (missing). */
function get(key, file) {
  try {
    wrangler(["r2", "object", "get", `${BUCKET}/${key}`, "--remote", "--file", file]);
    return readFileSync(file);
  } catch {
    return null;
  }
}

function main(apply) {
  const out = wrangler([
    "d1",
    "execute",
    "passalong",
    "--remote",
    "--json",
    "--command",
    "SELECT id, project_id, type FROM project_file",
  ]);
  const parsed = JSON.parse(out);
  const rows = (Array.isArray(parsed) ? parsed[0] : parsed)?.results ?? [];
  const types = new Map(rows.map((r) => [`${r.project_id}/${r.id}`, r.type]));
  const tmp = mkdtempSync(join(tmpdir(), "passalong-move-"));
  let moved = 0,
    skipped = 0,
    missing = 0,
    failed = 0;
  try {
    for (const { from, to } of plan(rows)) {
      if (get(to, join(tmp, "new"))) {
        skipped++;
        continue;
      }
      const bytes = get(from, join(tmp, "old"));
      if (!bytes) {
        console.error(`missing  ${from}`);
        missing++;
        continue;
      }
      if (!apply) {
        console.log(`would move  ${from} -> ${to} (${bytes.length} bytes)`);
        moved++;
        continue;
      }
      const type = types.get(to.slice("projects/".length)) || "application/octet-stream";
      wrangler([
        "r2",
        "object",
        "put",
        `${BUCKET}/${to}`,
        "--remote",
        "--file",
        join(tmp, "old"),
        "--content-type",
        type,
      ]);
      const copy = get(to, join(tmp, "new"));
      if (!copy || !copy.equals(bytes)) {
        console.error(`copy did not match, kept  ${from}`);
        failed++;
        continue;
      }
      wrangler(["r2", "object", "delete", `${BUCKET}/${from}`, "--remote"]);
      console.log(`moved  ${from} -> ${to}`);
      moved++;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(
    `${apply ? "moved" : "to move"} ${moved}, already moved ${skipped}, missing ${missing}, failed ${failed}${apply ? "" : " (dry run: --apply to act)"}`,
  );
  if (failed) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.includes("--apply"));
