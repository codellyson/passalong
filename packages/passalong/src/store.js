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

// ---- accounts on this machine -----------------------------------------------------------------
//
// One machine used to hold one login: a single `token` and `api` in the config, so every repo and
// every agent acted as whoever signed in last, and a second `login` overwrote the first. They are
// now kept by name under `accounts`, with `active` naming the one a person at a terminal gets by
// default. `token`, `api` and `team` stay at the top of the file as a copy of the active account,
// because that is where every older reader — and every older CLI sharing this directory — looks.

/** Every login on this machine by name. Empty on a config from before there were several. */
export function readAccounts(cfg = readConfig()) {
  return cfg.accounts && typeof cfg.accounts === "object" ? cfg.accounts : {};
}

const slug = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

/** What a login is called when its owner has not said: their @handle, else the start of their email. */
export function nameFor({ handle, email, account }) {
  return slug(handle) || slug(String(email ?? "").split("@")[0]) || slug(account) || "account";
}

/** Make `name` the default: what a person at a terminal gets, and what older readers see. */
export function setActive(name) {
  const entry = readAccounts()[name];
  if (!entry) throw new Error(`no account called "${name}" on this machine`);
  return writeConfig({
    active: name,
    token: entry.token,
    api: entry.api,
    team: entry.team || "",
  });
}

/**
 * Keep a login under a name. A login of an account already here is updated in place rather than
 * added twice; a new one takes `nameFor`, with a number on the end if that is taken. The first
 * login on a machine becomes the default, and so does any that `activate` asks for.
 */
export function saveAccount(entry, { activate = false } = {}) {
  const cfg = readConfig();
  const all = { ...readAccounts(cfg) };
  const same = Object.entries(all).find(
    ([, a]) => entry.account && a.account === entry.account && a.api === entry.api,
  );
  let name = same?.[0];
  if (!name) {
    const base = nameFor(entry);
    name = base;
    for (let i = 2; all[name]; i++) name = `${base}-${i}`;
  }
  all[name] = { ...(same?.[1] ?? {}), ...entry };
  writeConfig({ accounts: all });
  if (activate || !cfg.active || !readAccounts(cfg)[cfg.active]) setActive(name);
  else if (cfg.active === name) setActive(name);
  return name;
}

/** Set the team an account works in, and mirror it when that account is the default. */
export function saveTeam(name, team) {
  const cfg = readConfig();
  const all = readAccounts(cfg);
  if (name && all[name]) {
    writeConfig({ accounts: { ...all, [name]: { ...all[name], team } } });
    if (cfg.active === name) writeConfig({ team });
  } else writeConfig({ team });
}

/**
 * Forget a login. If it was the default, the first one left takes over — said to the person by the
 * caller, because a default that changes silently is the thing this exists to stop.
 */
export function removeAccount(name) {
  const cfg = readConfig();
  const all = { ...readAccounts(cfg) };
  if (!all[name]) return { removed: false, active: cfg.active || "" };
  delete all[name];
  writeConfig({ accounts: all });
  if (cfg.active !== name) return { removed: true, active: cfg.active || "" };
  const next = Object.keys(all)[0];
  if (next) {
    setActive(next);
    return { removed: true, active: next };
  }
  const bare = readConfig();
  delete bare.active;
  delete bare.token;
  delete bare.team;
  delete bare.accounts;
  writeFileSync(CONFIG, `${JSON.stringify(bare, null, 2)}\n`, { mode: 0o600 });
  return { removed: true, active: "" };
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
