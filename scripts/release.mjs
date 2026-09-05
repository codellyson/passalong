// One command to release the CLI: test, bump, commit, tag, push. The tag is what release.yml
// watches, but nobody types `git tag` — doing that by hand is how v0.2.0 ended up on the remote
// pointing at a commit whose DEFAULT_API still read kreativekorna, and a pushed tag cannot be
// quietly corrected.
//
//   pnpm release          # patch
//   pnpm release minor
//
// (`release`, not `publish`: `pnpm publish` is a pnpm built-in, the same trap `pnpm deploy` is.)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "packages", "passalong", "package.json");

const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
const loud = (cmd, ...args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });
const version = () => JSON.parse(readFileSync(pkgPath, "utf8")).version;

const die = (msg) => {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
};
const exists = (cmd, ...args) => {
  try {
    execFileSync(cmd, args, { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const bump = process.argv[2] ?? "patch";
if (!["patch", "minor", "major"].includes(bump))
  die(`unknown bump "${bump}" — patch, minor, major`);

// A release is a commit and a tag on a remote; both are awkward to take back, so every check that
// can run before the push runs before the push.
if (git("status", "--porcelain")) die("working tree is not clean — commit or stash first");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch !== "master") die(`on ${branch}, not master`);
git("fetch", "origin", "--tags", "--quiet");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/master"))
  die("master and origin/master have diverged — pull or push first");

console.log("· running the package tests");
loud("pnpm", "-C", "packages/passalong", "test");

console.log(`· bumping ${version()} (${bump})`);
loud("npm", "version", bump, "--no-git-tag-version", "--prefix", "packages/passalong");
const next = version();
const tag = `v${next}`;

// Roll the bump back rather than leaving the tree edited under a name that cannot be used.
const abort = (msg) => {
  git("checkout", "--", pkgPath);
  die(msg);
};
if (git("tag", "-l", tag)) abort(`${tag} already exists locally — that version is spent`);
if (git("ls-remote", "--tags", "origin", tag)) abort(`${tag} is already on the remote`);
if (exists("npm", "view", `passalong@${next}`, "version"))
  abort(`passalong@${next} is already published`);

console.log(`· committing, tagging ${tag}, pushing`);
git("add", pkgPath);
git("commit", "-m", `Release the CLI at ${next}`);
git("tag", tag);
git("push", "origin", "master", tag);

console.log(`\n  ${tag} pushed. release.yml publishes passalong@${next}:`);
console.log("  https://github.com/codellyson/passalong/actions/workflows/release.yml\n");
