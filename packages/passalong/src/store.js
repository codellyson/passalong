// The local store: ~/.passalong (override with PASSALONG_HOME). Guides are one markdown file each so
// the whole thing is greppable, git-friendly, and there is nothing to export that isn't
// already a file you own.
//
//   ~/.passalong/config.json   api url + token
//   ~/.passalong/guides/<id>.md
//   ~/.passalong/drafts/*.md   captured but not yet shared
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse, serialize } from "./guide.js";

export const HOME = process.env.PASSALONG_HOME || join(homedir(), ".passalong");
export const GUIDES = join(HOME, "guides");
export const DRAFTS = join(HOME, "drafts");
const CONFIG = join(HOME, "config.json");

function ensure() {
  for (const d of [HOME, GUIDES, DRAFTS])
    if (!existsSync(d)) mkdirSync(d, { recursive: true, mode: 0o700 });
}

export function readConfig() {
  if (!existsSync(CONFIG)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG, "utf8"));
  } catch {
    return {};
  }
}

export function writeConfig(patch) {
  ensure();
  const next = { ...readConfig(), ...patch };
  writeFileSync(CONFIG, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return next;
}

export function guidePath(id) {
  return join(GUIDES, `${id}.md`);
}

export function get(id) {
  const p = guidePath(id);
  if (!existsSync(p)) return null;
  return parse(readFileSync(p, "utf8"));
}

export function save(guide) {
  ensure();
  writeFileSync(guidePath(guide.meta.id), serialize(guide));
  return guidePath(guide.meta.id);
}

export function remove(id) {
  const p = guidePath(id);
  if (existsSync(p)) unlinkSync(p);
}

/** All local guides, newest first. */
export function list() {
  ensure();
  return readdirSync(GUIDES)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parse(readFileSync(join(GUIDES, f), "utf8")))
    .filter((g) => g.meta.id)
    .sort((a, b) => (b.meta.created || "").localeCompare(a.meta.created || ""));
}

/** Draft files, newest first. */
export function drafts() {
  ensure();
  return readdirSync(DRAFTS)
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(DRAFTS, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

export function draftPath(name) {
  ensure();
  return join(DRAFTS, `${name}.md`);
}

export function removeDraft(path) {
  if (path.startsWith(DRAFTS) && existsSync(path)) unlinkSync(path);
}

/** Case-insensitive match on title, tags, source context, and body. */
export function search(query, guides = list()) {
  const q = query.trim().toLowerCase();
  if (!q) return guides;
  const terms = q.split(/\s+/);
  return guides.filter((g) => {
    const hay = [
      g.meta.title,
      g.meta.source_context,
      ...(g.meta.tags || []),
      ...(g.meta.stack_assumptions || []),
      g.body,
    ]
      .join("\n")
      .toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}
