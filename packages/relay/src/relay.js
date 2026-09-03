// The operations Relay exposes. Both surfaces (bin/relay and the MCP server) call these, so
// anything an agent can do through MCP a human can do from the terminal and vice versa.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as api from "./api.js";
import { context } from "./capture.js";
import { ID_RE, parse, STATUSES, serialize, stamp, stripPlaceholders, validate } from "./guide.js";
import * as store from "./store.js";

export class RelayError extends Error {}

/**
 * Publish a guide from markdown: fill in defaults, validate, store locally, and sync when
 * logged in. Returns { guide, path, url, synced }.
 */
export async function share(markdown, { cwd = process.cwd() } = {}) {
  const c = context(cwd);
  const raw = parse(markdown);
  let guide = stamp(
    { meta: raw.meta, body: stripPlaceholders(raw.body) },
    {
      author: c.author,
      source_context: c.branch && c.branch !== "HEAD" ? `${c.name}@${c.branch}` : c.name,
    },
  );
  const errors = validate(guide);
  if (errors.length)
    throw new RelayError(`guide is not ready to share:\n  - ${errors.join("\n  - ")}`);
  if (guide.meta.status === "draft")
    guide = { ...guide, meta: { ...guide.meta, status: "published" } };

  let url = guide.meta.url || null;
  let synced = false;
  if (api.loggedIn()) {
    const res = await api.publish(guide.meta.id, serialize(guide));
    url = res.url;
    synced = true;
    guide = { ...guide, meta: { ...guide.meta, url } };
  }
  const path = store.save(guide);
  return { guide, path, url, synced };
}

/** Resolve a reference (id, share URL, or local file path) to a guide. */
export async function resolve(ref) {
  if (/^https?:\/\//.test(ref)) {
    const md = await api.fetchShared(ref);
    return { guide: parse(md), from: "link" };
  }
  if (ref.endsWith(".md") && existsSync(ref)) {
    const { readFileSync } = await import("node:fs");
    return { guide: parse(readFileSync(ref, "utf8")), from: "file" };
  }
  if (!ID_RE.test(ref)) throw new RelayError(`"${ref}" is not a relay id, share link, or .md file`);
  const local = store.get(ref);
  if (local) return { guide: local, from: "local" };
  if (api.loggedIn()) {
    try {
      const md = await api.get(ref);
      const guide = parse(md);
      store.save(guide); // cache so the next pull is offline
      return { guide, from: "sync" };
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }
  throw new RelayError(
    `no guide "${ref}" (not local${api.loggedIn() ? " or synced" : "; not logged in, so sync was not checked"})`,
  );
}

/**
 * Pull a guide into a working directory: writes .relay/<id>.md there and returns the guide so
 * the caller can put the text straight into an agent's context.
 */
export async function pull(ref, { cwd = process.cwd(), write = true } = {}) {
  const { guide, from } = await resolve(ref);
  let path = null;
  if (write) {
    const dir = join(cwd, ".relay");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    path = join(dir, `${guide.meta.id}.md`);
    writeFileSync(path, serialize(guide));
  }
  return { guide, from, path, markdown: serialize(guide) };
}

/** Local guides merged with synced ones (by id), newest first, optionally filtered. */
export async function list(query = "", { remote = true } = {}) {
  const local = store.search(query);
  const seen = new Set(local.map((g) => g.meta.id));
  const rows = local.map((g) => ({ ...summary(g), where: "local" }));
  if (remote && api.loggedIn()) {
    try {
      const res = await api.list(query);
      for (const r of res.guides) {
        if (seen.has(r.id)) {
          const row = rows.find((x) => x.id === r.id);
          row.where = "synced";
          row.url = r.url;
          row.pulls = r.pulls;
        } else rows.push({ ...r, where: "synced" });
      }
    } catch (err) {
      rows.warning = `sync unavailable: ${err.message}`;
    }
  }
  return rows.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
}

export function summary(g) {
  return {
    id: g.meta.id,
    title: g.meta.title,
    status: g.meta.status,
    created: g.meta.created,
    source_context: g.meta.source_context,
    tags: g.meta.tags || [],
    stack_assumptions: g.meta.stack_assumptions || [],
    url: g.meta.url || null,
  };
}

/** Move a guide through its lifecycle: published → consumed → promoted (any order allowed). */
export async function setStatus(id, status) {
  if (!STATUSES.includes(status))
    throw new RelayError(`status must be one of ${STATUSES.join(", ")}`);
  const { guide } = await resolve(id);
  const next = { ...guide, meta: { ...guide.meta, status } };
  store.save(next);
  if (api.loggedIn() && guide.meta.url) await api.setStatus(id, status);
  return next;
}

export async function remove(id) {
  store.remove(id);
  if (api.loggedIn()) {
    try {
      await api.remove(id);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }
}

/** Write every local guide to a directory as plain markdown. Returns the paths written. */
export function exportAll(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const paths = [];
  for (const g of store.list()) {
    const p = join(dir, `${g.meta.id}.md`);
    writeFileSync(p, serialize(g));
    paths.push(p);
  }
  return paths;
}
