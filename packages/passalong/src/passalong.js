// The operations Passalong exposes. Both surfaces (bin/passalong and the MCP server) call these,
// so anything an agent can do through MCP a human can do from the terminal and vice versa.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as api from "./api.js";
import { context } from "./capture.js";
import {
  bugGuide,
  ID_RE,
  parse,
  STATUSES,
  serialize,
  stamp,
  stripPlaceholders,
  validate,
} from "./guide.js";
import * as store from "./store.js";

export class PassalongError extends Error {}

/** "team" or "team/handle" → { team, to }. */
/**
 * Split `--to` into a team and who inside it: "team", "team/@handle", or "team/#group".
 *
 * Only the `@` is stripped. The `#` is load-bearing and travels into the frontmatter as written —
 * it is the sigil the server reads to tell a person from a group, and dropping it here would turn
 * a handoff to six people into a lookup for a teammate who does not exist.
 */
export function parseTarget(to) {
  if (!to) return {};
  const [team, who] = String(to).split("/");
  return { team: team.trim(), to: who ? who.trim().replace(/^@/, "") : undefined };
}

/**
 * Publish a guide from markdown: fill in defaults, validate, store locally, and sync when
 * logged in. `to` addresses it: "team", "team/@handle", or "team/#group". Returns
 * { guide, path, url, synced }.
 */
export async function share(markdown, { cwd = process.cwd(), to } = {}) {
  const c = context(cwd);
  const raw = parse(markdown);
  let guide = stamp(
    { meta: raw.meta, body: stripPlaceholders(raw.body) },
    {
      author: c.author,
      source_context: c.branch && c.branch !== "HEAD" ? `${c.name}@${c.branch}` : c.name,
    },
  );
  const target = parseTarget(to);
  if (target.team) guide.meta.team = target.team;
  if (target.to) guide.meta.to = target.to;
  if (guide.meta.to && !guide.meta.team)
    throw new PassalongError("`to:` needs a team — address a handoff as team/handle");
  const errors = validate(guide);
  if (errors.length)
    throw new PassalongError(`guide is not ready to share:\n  - ${errors.join("\n  - ")}`);
  if (guide.meta.status === "draft")
    guide = { ...guide, meta: { ...guide.meta, status: "published" } };

  let url = guide.meta.url || null;
  let synced = false;
  let notified = false;
  if (api.loggedIn()) {
    const res = await api.publish(guide.meta.id, serialize(guide));
    url = res.url;
    synced = true;
    notified = Boolean(res.notified);
    guide = { ...guide, meta: { ...guide.meta, url } };
  } else if (guide.meta.team) {
    throw new PassalongError("sharing to a team needs sync — run `passalong login` first");
  }
  const path = store.save(guide);
  return { guide, path, url, synced, notified };
}

/**
 * File a set of bugs as one report.
 *
 * The report is opened first because each issue's frontmatter names it, and the issues go up one
 * at a time — a partial failure that has filed three of five should say which three, since the
 * three that landed are real guides someone can already act on.
 *
 * Unlike `share()`, this needs sync: a report is a server-side parent, and there is nothing local
 * for a set to belong to. One bug on its own does not — that is just `share()` with a bug
 * document, and it works offline like any other guide.
 */
export async function fileBugs(
  { title = "", environment = "", issues = [] },
  { cwd = process.cwd(), to } = {},
) {
  if (!issues.length) throw new PassalongError("a report needs at least one issue");
  if (!api.loggedIn())
    throw new PassalongError("filing a report needs sync — run `passalong login` first");
  const target = parseTarget(to);
  const { report } = await api.createReport({
    title,
    environment,
    team: target.team || "",
    to: target.to || "",
  });

  const filed = [];
  try {
    for (const issue of issues) {
      const markdown = bugGuide({ ...issue, report: report.id, environment });
      const { guide, url } = await share(markdown, { cwd, to });
      filed.push({
        id: guide.meta.id,
        title: guide.meta.title,
        area: guide.meta.area || "",
        severity: guide.meta.severity || "",
        url,
      });
    }
  } catch (err) {
    if (!filed.length) throw err;
    throw new PassalongError(
      `filed ${filed.length} of ${issues.length} issues (${filed
        .map((f) => f.id)
        .join(", ")}) before failing: ${err.message}`,
    );
  }
  return { report: { id: report.id, title, environment }, issues: filed };
}

/** Resolve a reference (id, share URL, or local file path) to a guide. */
export async function resolve(ref) {
  if (/^https?:\/\//.test(ref)) {
    const md = await api.fetchShared(ref);
    return { guide: parse(md), from: "link" };
  }
  if (ref.endsWith(".md") && existsSync(ref)) {
    return { guide: parse(readFileSync(ref, "utf8")), from: "file" };
  }
  if (!ID_RE.test(ref))
    throw new PassalongError(`"${ref}" is not a passalong id, share link, or .md file`);
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
  throw new PassalongError(
    `no guide "${ref}" (not local${api.loggedIn() ? " or synced" : "; not logged in, so sync was not checked"})`,
  );
}

/**
 * Resolve a reference to its id alone, without fetching the guide.
 *
 * The reader's two answers — an ack and a verdict — are writes that take an id and nothing else,
 * so the guide body they used to fetch on the way was never read. That fetch was not free:
 * `GET /v1/guides/:id` records a pull, which is how somebody saying "not me" on a handoff
 * registered as taking delivery of it — inflating the guide's pull count and moving it into the
 * sender's "landed" queue. An id needs no lookup at all, and a link or a file carries the id in
 * its own frontmatter.
 *
 * Unlike `resolve()`, a bare id is not checked for existence here. The server answers that when
 * the write lands, and "no such guide" from the route the write went to is the same news one
 * round trip earlier.
 */
export async function resolveId(ref) {
  if (/^https?:\/\//.test(ref)) return parse(await api.fetchShared(ref)).meta.id;
  if (ref.endsWith(".md") && existsSync(ref)) return parse(readFileSync(ref, "utf8")).meta.id;
  if (ID_RE.test(ref)) return ref;
  throw new PassalongError(`"${ref}" is not a passalong id, share link, or .md file`);
}

/**
 * Pull a guide into a working directory: writes .passalong/<id>.md there and returns the guide
 * so the caller can put the text straight into an agent's context. A pull of someone else's
 * guide is also recorded server-side, which is how the sender sees the transfer landed.
 */
export async function pull(ref, { cwd = process.cwd(), write = true } = {}) {
  const { guide, from } = await resolve(ref);
  // A locally cached copy of a teammate's guide still counts as a pull for them.
  if (from === "local" && api.loggedIn() && guide.meta.team) {
    api.get(guide.meta.id).catch(() => {});
  }
  let path = null;
  if (write) {
    const dir = join(cwd, ".passalong");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // A pulled guide carries its own share URL in the frontmatter, and that URL needs no account
    // to read. Committing this directory would publish the guide to anyone who can see the repo,
    // so the directory ignores itself. Delete this file if you do want guides in the repo.
    const ignore = join(dir, ".gitignore");
    if (!existsSync(ignore)) writeFileSync(ignore, "*\n");
    path = join(dir, `${guide.meta.id}.md`);
    writeFileSync(path, serialize(guide));
  }
  return { guide, from, path, markdown: serialize(guide) };
}

/** Local guides merged with synced ones (by id), newest first, optionally filtered. */
export async function list(query = "", { remote = true, scope = "" } = {}) {
  const local = scope && scope !== "all" && scope !== "mine" ? [] : store.search(query);
  const seen = new Set(local.map((g) => g.meta.id));
  const rows = local.map((g) => ({ ...summary(g), where: "local" }));
  if (remote && api.loggedIn()) {
    try {
      const res = await api.list(query, scope);
      for (const r of res.guides) {
        const row = seen.has(r.id) ? rows.find((x) => x.id === r.id) : null;
        if (row) Object.assign(row, r, { where: "synced" });
        else rows.push({ ...r, where: "synced" });
      }
    } catch (err) {
      rows.warning = `sync unavailable: ${err.message}`;
    }
  }
  return rows.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
}

/** Guides handed to you (or your teams) that you have not pulled yet. Needs sync. */
export async function inbox() {
  const res = await api.inbox();
  return res.guides;
}

/**
 * The state of your transfers as four queues: waiting on you, in flight (handed over, untouched),
 * and landed (someone else has it). Needs sync.
 */
export const board = () => api.board();

/**
 * What happened while you were away: your guides being pulled and shipped, guides handed to you,
 * invites taken up. Each item carries a rendered `text` line so every surface says the same thing.
 */
export async function activity({ all = false, limit = 50 } = {}) {
  return api.notifications({ unread: !all, limit });
}

/**
 * Report whether a guide actually works. This is the reader's answer, not the author's status:
 * `done` says "I implemented it", a verdict says "I tried it and it holds up" — or does not.
 * A failing verdict needs a note; "it doesn't work" without a reason helps nobody.
 */
export async function verdict(id, ok, note = "") {
  if (!api.loggedIn()) throw new PassalongError("verdicts need sync — run `passalong login` first");
  if (!ok && !note.trim())
    throw new PassalongError("say what went wrong: passalong failed <id> <what happened>");
  return api.verdict(await resolveId(id), ok, note.trim());
}

/**
 * Say whether you are taking a guide someone handed you — before doing any of it.
 *
 * The hop the product had no signal for: until this, a handoff nobody had answered looked exactly
 * like one nobody had noticed. Passing needs a reason for the same cause a failing verdict does —
 * "not me" without "why" leaves the sender where the silence did.
 */
export async function ack(id, taken, note = "") {
  if (!api.loggedIn()) throw new PassalongError("acks need sync — run `passalong login` first");
  if (!taken && !note.trim())
    throw new PassalongError("say why you are passing: pass a note with taken=false");
  return api.ack(await resolveId(id), taken, note.trim());
}

/** Mark notifications seen. No ids means everything unread. */
export const seen = (ids = []) => api.markRead(ids);

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
    team: g.meta.team || "",
    to: g.meta.to || "",
    mine: true,
  };
}

/** Move a guide through its lifecycle: published → consumed → promoted (any order allowed). */
export async function setStatus(id, status) {
  if (!STATUSES.includes(status))
    throw new PassalongError(`status must be one of ${STATUSES.join(", ")}`);
  const { guide } = await resolve(id);
  const next = { ...guide, meta: { ...guide.meta, status } };
  store.save(next);
  if (api.loggedIn() && guide.meta.url) await api.setStatus(id, status);
  return next;
}

export async function remove(id) {
  // Server first: if it refuses (not the author), the local copy must survive too.
  if (api.loggedIn()) {
    try {
      await api.remove(id);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }
  store.remove(id);
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
