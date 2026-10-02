// The operations Passalong exposes. Both surfaces (bin/passalong and the MCP server) call these,
// so anything an agent can do through MCP a human can do from the terminal and vice versa.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { basename, join } from "node:path";
import * as api from "./api.js";
import { context } from "./capture.js";
import { refusal, runChecks } from "./checks.js";
import {
  bugGuide,
  ID_RE,
  parse,
  STATUSES,
  serialize,
  stamp,
  stripPlaceholders,
  unheldFields,
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
export async function share(markdown, { cwd = process.cwd(), to, follows } = {}) {
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
  // `follows` names the guide this one came out of: an id, a share link, or a pulled .md file. An id
  // is used as it is; a link or a file is read for the id in its own frontmatter. `validate()` below
  // is what refuses a guide that names itself.
  if (follows) guide.meta.parent = await resolveId(String(follows).trim());
  if (guide.meta.to && !guide.meta.team)
    throw new PassalongError("`to:` needs a team — address a handoff as team/handle");
  const errors = [
    ...unheldFields(markdown).map(
      (k) =>
        `frontmatter "${k}" holds more than a string or a list of strings, and it would be dropped — move it into the body (a fenced yaml block keeps it as written)`,
    ),
    ...validate(guide),
  ];
  if (errors.length)
    throw new PassalongError(`guide is not ready to share:\n  - ${errors.join("\n  - ")}`);
  // A task stays a draft when it is shared. Draft is the column a task waits in until a person
  // says it is ready for an agent — `ready()` — and an agent that drafts one over MCP comes
  // through here too, so publishing on share would let a task queue itself with nobody reading it.
  if (guide.meta.status === "draft" && guide.meta.kind !== "task")
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
    path = join(localDir(cwd), `${guide.meta.id}.md`);
    writeFileSync(path, serialize(guide));
  }
  return { guide, from, path, markdown: serialize(guide) };
}

/**
 * `.passalong/` in a working directory, made if it is missing.
 *
 * A pulled guide carries its own share URL in the frontmatter, and that URL needs no account to
 * read. Committing this directory would publish the guide to anyone who can see the repo, so the
 * directory ignores itself. Delete its .gitignore if you do want guides in the repo.
 */
function localDir(cwd) {
  const dir = join(cwd, ".passalong");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n");
  return dir;
}

/**
 * Who this worktree is to the task queue, minted the first time it asks.
 *
 * A claim belongs to an agent, not an account: one person runs several, and "no two agents on one
 * task" means nothing if the server cannot tell them apart. The id lives in the worktree's own
 * `.passalong/agent.json`, so a restarted session in the same worktree is the same agent and gets
 * its task back, and a second worktree of the same repo is a different agent. Per machine would
 * let two worktrees on one laptop share a lock; per session would lose the task on every restart.
 */
export function agent(cwd = process.cwd()) {
  const c = context(cwd);
  const root = c.root || cwd;
  const file = join(localDir(root), "agent.json");
  let id = "";
  try {
    id = String(JSON.parse(readFileSync(file, "utf8")).id || "");
  } catch {}
  if (!/^[a-z0-9]{8,64}$/.test(id)) {
    id = randomBytes(12).toString("hex");
    writeFileSync(file, `${JSON.stringify({ id }, null, 2)}\n`);
  }
  return { agent: id, host: hostname(), repo: c.repo, worktree: root };
}

/** This worktree's agent if it has one, without creating it. `agent` is "" when there is none. */
function knownAgent(cwd = process.cwd()) {
  const c = context(cwd);
  const root = c.root || cwd;
  let id = "";
  try {
    id = String(JSON.parse(readFileSync(join(root, ".passalong", "agent.json"), "utf8")).id || "");
  } catch {}
  return { agent: /^[a-z0-9]{8,64}$/.test(id) ? id : "", repo: c.repo };
}

function needsSync(what) {
  if (!api.loggedIn())
    throw new PassalongError(
      `${what} needs sync — the queue lives on the server (run \`passalong login\`)`,
    );
}

/** Every task you can see, with where it is and who has it. */
export async function tasks() {
  needsSync("the task queue");
  return (await api.tasks()).tasks;
}

/**
 * Take the next task for this worktree's repo, or get back the one this worktree already holds.
 * `null` when there is nothing to do. The guide is written to `.passalong/<id>.md` like a pull.
 */
export async function nextTask({ cwd = process.cwd(), any = false } = {}) {
  needsSync("taking a task");
  const { task } = await api.nextTask({ ...agent(cwd), any });
  if (!task) return null;
  const guide = parse(task.markdown);
  const path = join(localDir(agent(cwd).worktree), `${task.id}.md`);
  writeFileSync(path, task.markdown);
  store.save(guide);
  return { ...task, path };
}

/** Word from the agent holding a task: renews its lease, and `note` becomes the board's line. */
export async function taskProgress(id, note, { cwd = process.cwd() } = {}) {
  needsSync("reporting progress");
  const { agent: a } = agent(cwd);
  return api.taskProgress(id, note ? { agent: a, note } : { agent: a });
}

/**
 * What a hand-in has to carry, checked before anything is published.
 *
 * The server refuses the call without it anyway; the reason to check first is that publishing the
 * write-up and then being refused leaves a guide nobody asked for behind every refused hand-in.
 * The rule and the wording are the server's — see evidenceProblem() in apps/api/src/claims.ts.
 */
/**
 * The claim generation this worktree was given when it took a guide, kept in `.passalong/held.json`
 * beside `agent.json`. See apps/api/migrations/0029_claim_fence.sql.
 *
 * The agent never sees this number and is never asked for it — a model echoing an integer back
 * three calls later is not a lock. `take` writes it, and every call that writes to the claim sends
 * it, so a hand-in belonging to a claim that was released and re-taken is refused by the server
 * rather than landing on somebody else's work.
 */
function fenceFile(cwd) {
  return join(localDir(agent(cwd).worktree), "held.json");
}

function heldFences(cwd) {
  try {
    const held = JSON.parse(readFileSync(fenceFile(cwd), "utf8"));
    return held && typeof held === "object" ? held : {};
  } catch {
    return {};
  }
}

/** The number this worktree holds for a guide, or undefined when it has none to send. */
function fenceFor(id, cwd) {
  const n = heldFences(cwd)[id];
  return Number.isInteger(n) ? n : undefined;
}

function rememberFence(id, fence, cwd) {
  if (!Number.isInteger(fence)) return;
  const held = heldFences(cwd);
  held[id] = fence;
  writeFileSync(fenceFile(cwd), `${JSON.stringify(held, null, 2)}\n`);
}

/** A check a runner executed: the command it ran, and what the process returned. See checks.js. */
const verified = (c) => Boolean(c?.cmd) && (typeof c?.exit === "number" || c?.exit === null);

function requireEvidence(evidence) {
  const said = String(evidence || "").trim();
  if (said.length >= 16) return;
  throw new PassalongError(
    "send `evidence`: what you ran and what came back — the command and the lines that decided " +
      "it, a test summary, a link to the change, or a screenshot url. " +
      `"${said || "nothing"}" is a claim, not evidence.`,
  );
}

/**
 * The work is done: the task moves to review with a transfer guide about it attached.
 *
 * Pass `markdown` and this writes that guide too, with `parent:` naming the task, so the write-up
 * and the finish are one step and neither can be skipped or pointed at the wrong guide. Pass
 * `report` instead when the guide is already published.
 */
export async function finishTask(
  id,
  { report, markdown, evidence = "", pr = "", note = "", cwd = process.cwd() } = {},
) {
  needsSync("finishing a task");
  requireEvidence(evidence);
  if (!report && markdown) {
    const g = parse(markdown);
    // A task's report is a transfer guide, and this code is what is making one — so it says so
    // rather than hoping the agent's frontmatter did. Absent is refused now, and refusing an
    // agent's hand-in because its write-up left a line off would be this function's omission
    // charged to the agent. Stated, not defaulted: `kind` is the one field here that is not the
    // author's to leave open, because the caller already knows the answer.
    report = (
      await share(serialize({ meta: { ...g.meta, kind: "transfer", parent: id }, body: g.body }), {
        cwd,
      })
    ).guide.meta.id;
  }
  if (!report)
    throw new PassalongError(
      "finishing needs the write-up: `markdown` for a transfer guide about the work, or `report` with the id of one",
    );
  return api.finishTask(id, { agent: agent(cwd).agent, report, evidence, pr, note });
}

/**
 * The four verbs every guide answers to, whatever its kind (docs/V2.md §11). Each answer carries
 * `next`, the calls that make sense from here, and `say` when the move is to stop.
 *
 * take: this worktree's agent takes guide `id`, or with no id the next one waiting for it. The
 * document is written to `.passalong/<id>.md`, like a pull, so the agent works from a file.
 */
export async function take(id, { cwd = process.cwd(), any = false } = {}) {
  needsSync("taking work");
  const who = agent(cwd);
  const r = await api.take({ ...who, ...(id ? { id: await resolveId(id) } : {}), any });
  if (!r.guide?.markdown) return r;
  rememberFence(r.guide.id, r.guide.fence, cwd);
  const path = join(localDir(who.worktree), `${r.guide.id}.md`);
  writeFileSync(path, r.guide.markdown);
  store.save(parse(r.guide.markdown));
  return { ...r, path };
}

/** Word from the agent that holds it: the lease starts again, and `note` is what the hub shows. */
export async function progress(id, note, { cwd = process.cwd() } = {}) {
  needsSync("reporting progress");
  const fence = fenceFor(id, cwd);
  return api.progress(id, {
    agent: agent(cwd).agent,
    ...(note ? { note } : {}),
    ...(fence === undefined ? {} : { fence }),
  });
}

/**
 * Done here. A task hands in a write-up — `markdown`, published with `parent:` naming the task, or
 * `report`, the id of one already published — for its author to review against Acceptance. Any
 * other guide hands in whether its Verification held: `ok`, and a `note` when it did not.
 *
 * Every hand-in carries `evidence`: what was run and what came back. The write-up and the `ok` are
 * both the agent's word for its own work; evidence is the part the reviewer can check.
 */
export async function handIn(
  id,
  {
    ok,
    note = "",
    evidence = "",
    checks = [],
    writeup = "",
    risk = "",
    markdown,
    report,
    pr = "",
    cwd = process.cwd(),
  } = {},
) {
  needsSync("handing work in");
  // A check that names a command is run here, before anything is sent.
  //
  // The MCP server did this and this function did not, so "put the command in `cmd` and it is
  // executed here" was true over one transport and a quiet lie over the other: a `cmd` handed to
  // this function was passed along as a string nothing had executed. Checks that already carry an
  // exit came from the server's own runner and are left alone, so nothing runs twice.
  const pending = checks.filter((c) => c?.cmd && typeof c?.exit !== "number" && c?.exit !== null);
  if (pending.length) {
    const done = runChecks(pending, { cwd });
    const byCheck = new Map(done.checks.map((c) => [c.check, c]));
    checks = checks.map((c) => byCheck.get(c.check) ?? c);
    if (done.failed) {
      throw new Error(refusal(done.failed, { ran: done.ran, total: checks.length }));
    }
  }
  // Checks are evidence, sorted against the lines they answer: bringing them is bringing it. A
  // check whose command was actually run is exempt from the length rule — its exit code is the
  // evidence, and `test -f dist/app.js` exiting 0 says more than any sentence about it would.
  if (checks.length) checks.forEach((c) => (verified(c) ? null : requireEvidence(c?.ran)));
  else requireEvidence(evidence);
  if (!report && markdown) {
    const g = parse(markdown);
    // A task's report is a transfer guide, and this code is what is making one — so it says so
    // rather than hoping the agent's frontmatter did. Absent is refused now, and refusing an
    // agent's hand-in because its write-up left a line off would be this function's omission
    // charged to the agent. Stated, not defaulted: `kind` is the one field here that is not the
    // author's to leave open, because the caller already knows the answer.
    report = (
      await share(serialize({ meta: { ...g.meta, kind: "transfer", parent: id }, body: g.body }), {
        cwd,
      })
    ).guide.meta.id;
  }
  const fence = fenceFor(id, cwd);
  return api.handIn(id, {
    agent: agent(cwd).agent,
    note,
    evidence,
    ...(fence === undefined ? {} : { fence }),
    ...(checks.length
      ? {
          checks: checks.map((c) => ({
            check: c.check,
            ran: c.ran,
            // Only present on a check that was run. The server keeps them apart the same way.
            ...(verified(c) ? { cmd: c.cmd, exit: c.exit, ok: c.ok } : {}),
          })),
        }
      : {}),
    ...(report ? { report, pr } : {}),
    // Left out when there is nothing to say, rather than sent as "": most hand-ins have nothing
    // to adapt, and the field is for the ones that do.
    ...(writeup ? { writeup } : {}),
    // What it could break, for the reviewer. Left out when empty, like the write-up.
    ...(risk ? { risk } : {}),
    ...(typeof ok === "boolean" ? { ok } : {}),
  });
}

/**
 * Give a guide or task you wrote to someone else in its team: `@handle` for one person, `#group`
 * for the people who do a thing, or "team" (or empty) for everyone. Whoever held it and is left out
 * has it taken back and is told; a task then only goes to the new assignee's agents. The local copy
 * is dropped so the next read shows the new `to:`.
 */
export async function assign(ref, to) {
  needsSync("reassigning");
  const id = await resolveId(ref);
  const target = !to || to === "team" || to === "everyone" ? "" : String(to).trim();
  const r = await api.assign(id, target);
  store.remove(id);
  return r;
}

/** Not this agent's to do: what it held is open again, and `why` goes to whoever is next. */
export async function pass(id, why, { cwd = process.cwd() } = {}) {
  needsSync("passing work");
  if (!String(why || "").trim())
    throw new PassalongError("say why you are passing it, so whoever is next knows");
  const fence = fenceFor(id, cwd);
  return api.pass(id, {
    agent: agent(cwd).agent,
    why,
    ...(fence === undefined ? {} : { fence }),
  });
}

/**
 * Ask the person a question and wait, keeping what you hold. Not `pass`, which gives the work back,
 * and not `progress`, which says carry on: the answer to this one is "stop, and take it again when
 * they have replied", and the reply comes back with that `take`.
 */
export async function ask(id, question, { cwd = process.cwd() } = {}) {
  needsSync("asking");
  if (!String(question || "").trim())
    throw new PassalongError("say what you need to know, so the person can answer it");
  const fence = fenceFor(id, cwd);
  return api.ask(id, {
    agent: agent(cwd).agent,
    question,
    ...(fence === undefined ? {} : { fence }),
  });
}

/**
 * What this worktree's agent holds right now, and what is waiting for it: what the session-start
 * and stop hooks read (src/hooks.js). `held` is null when it holds nothing. Counts are best effort
 * — a hook must never fail a session over a count.
 */
export async function now({ cwd = process.cwd() } = {}) {
  needsSync("seeing what you hold");
  // Read, never minted: the hooks run in every repo a session opens, and a worktree that has never
  // taken anything has no agent — and should not be given a .passalong/ folder for asking.
  const who = knownAgent(cwd);
  const [w, t, i, h] = await Promise.allSettled([
    api.working(),
    api.tasks(),
    api.inbox(),
    api.handedIn(),
  ]);
  if (w.status === "rejected") throw w.reason;
  const held =
    (who.agent && w.value.working.find((x) => x.agent === who.agent && x.by?.you)) || null;
  const tasks = t.status === "fulfilled" ? t.value.tasks : [];
  const waiting = {
    ready: tasks.filter((x) => x.state === "ready" && x.target === who.repo).length,
    inbox: i.status === "fulfilled" ? i.value.guides.length : 0,
  };
  // Everything waiting on the person, the way the hub's Needs you counts it: their tasks handed in
  // or stuck, handoffs of theirs handed in, and guides handed to them.
  const review = tasks.filter(
    (x) =>
      x.mine &&
      (x.state === "review" ||
        x.state === "stalled" ||
        (x.state === "claimed" && (x.claim?.asking || /^BLOCKED:/i.test(x.claim?.note || "")))),
  ).length;
  const handed = h.status === "fulfilled" ? h.value.handed_in.length : 0;
  return { held, waiting, needs: review + handed + waiting.inbox, agent: who.agent };
}

/**
 * The gate, a person's three answers to a task. Approve: the work in review is done. Reject: it
 * goes back to Ready with `why` on it for the next agent. Release: a task an agent holds, live or
 * stalled, goes back to Ready with a note saying where that agent left it.
 *
 * The local copy is dropped after each, so the next read of the task fetches what the server made
 * of it — a reject or a release rewrites the document, and a stale copy would hide exactly the
 * line the next reader needs.
 */
export async function approveTask(id) {
  needsSync("approving a task");
  const r = await api.approveTask(id);
  store.remove(id);
  return r;
}

export async function rejectTask(id, why) {
  needsSync("rejecting a task");
  if (!String(why || "").trim()) throw new PassalongError("say why: the next agent reads it");
  const r = await api.rejectTask(id, why);
  store.remove(id);
  return r;
}

/**
 * Take it back from whoever is holding it — a task, a handoff or a bug, and from all of them at
 * once when several people hold the same handoff in different repos.
 *
 * It was tasks only, which left an asymmetry nobody chose: the author of a handoff could mark it
 * done or give it to somebody else, and had no way to simply have it back.
 */
export async function release(id) {
  needsSync("taking work back");
  const r = await api.release(id);
  store.remove(id);
  return r;
}

/**
 * Pull a guide *and* take the handoff: the two halves of starting work, in one call.
 *
 * `pull` says the guide arrived. `ack` says somebody is doing it, which is the thing the sender
 * cannot find out any other way — and the two are deliberately separate, because reading a guide
 * to decide it is not yours is exactly what `pass` is for. Fetching is not committing.
 *
 * For an agent the distinction is real but the ordering never varies: it reads a guide because it
 * is about to follow it. So this is the path an agent takes when it means to do the work, and it
 * is one call rather than two — the mandated thing has to be the cheap thing or it gets skipped.
 * `pull` alone remains the way to read one without answering for it.
 *
 * The ack is best-effort and never costs the caller the markdown, which is what they came for:
 *
 *   - the author's own guide is a 403 (`ack` is the reader's answer and an author is not a party
 *     to it), and that is a no-op, not a failure — an agent working in its own user's repo hits
 *     this constantly;
 *   - logged out, there is nobody to tell;
 *   - anything else is reported in `ack_error` rather than swallowed, because an ack that quietly
 *     did not land leaves the sender in the silence the whole feature exists to end.
 */
export async function start(ref, { cwd = process.cwd(), write = true } = {}) {
  const pulled = await pull(ref, { cwd, write });
  const id = pulled.guide.meta.id;
  if (!api.loggedIn()) return { ...pulled, took: false, ack_error: "", own: false };
  try {
    await api.ack(id, true, "");
    return { ...pulled, took: true, ack_error: "", own: false };
  } catch (err) {
    if (err.status === 403) return { ...pulled, took: false, ack_error: "", own: true };
    return { ...pulled, took: false, ack_error: err.message, own: false };
  }
}

/**
 * The one line `get_guide` adds to a guide it is handing an agent, or "" when there is nothing to
 * say. Separate from the tool so it can be tested without a server.
 *
 * Only a guide that was addressed to somebody can be taken — one nobody was handed has no handoff
 * to answer for, and nudging about it is noise that teaches an agent to ignore the nudge.
 *
 * It goes after the document, not in front of it. Anything before the opening `---` stops the
 * frontmatter being frontmatter, and an agent that writes what it was handed back out to a file
 * would lose the id along with it.
 */
export function handoffNudge(meta = {}) {
  if (!meta.to && !meta.team) return "";
  return (
    "<!-- passalong: this guide was handed to someone. If you are about to do the work, call " +
    "take instead of get_guide — it takes the handoff so the sender stops guessing. " +
    "If you are only reading, or it turns out not to be yours, answer with pass with a reason. -->"
  );
}

/**
 * The image types a guide can carry as evidence. Mirrors SHOT_TYPES in apps/api/src/shots.ts —
 * the server is the authority and refuses anything else; this is what lets a local caller find
 * out before spending an upload on it.
 */
export const SHOT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * Attach a screenshot from disk, and return the markdown that points at it.
 *
 * Evidence belongs *in* the document: a guide travels as markdown to anyone holding its link, so
 * an image beside it would not travel at all. `claimShots` binds the upload to whichever guide's
 * markdown names it at publish, which is why this returns a line to paste rather than taking a
 * guide id — there is nothing to attach it to until the document says so.
 *
 * Local because it reads a path. An agent in a terminal has one; a hosted assistant does not, and
 * reaches the same route through `attach_screenshot` on the HTTP server instead.
 */
/**
 * The same upload, for an agent that has the image and not a path to it.
 *
 * `attach()` takes a path because a screenshot usually lands on disk. An agent driving a browser
 * often has the opposite: the pane hands back an image as a tool result and never writes a file, so
 * the only door into evidence was one it could not open. It did what anyone would — swapped to
 * `grep` and `tsc` checks and put what it saw in `writeup` — and said so itself: "a grep proves the
 * code changed, not that the screen renders right."
 *
 * Base64 in a tool call, which the HTTP server's instructions rightly warn against, because there
 * the alternative is `create_upload` and a curl. Here there is no alternative for bytes held in
 * memory, and this server is a local process talking to the same upload the file path uses.
 */
export async function attachBytes(data, { name = "", type = "image/png" } = {}) {
  if (!api.loggedIn())
    throw new PassalongError("attaching evidence needs sync — run `passalong login` first");
  const allowed = new Set(Object.values(SHOT_TYPES));
  if (!allowed.has(type))
    throw new PassalongError(`screenshots must be ${[...allowed].join(", ")} — ${type} is not one`);
  let bytes;
  try {
    // A data: URL is what several browser tools hand back, so it is accepted rather than made the
    // caller's problem to strip.
    bytes = Buffer.from(String(data).replace(/^data:[^,]*,/, ""), "base64");
  } catch {
    throw new PassalongError("`data` is not base64");
  }
  if (!bytes.length) throw new PassalongError("`data` decoded to nothing");
  // The server's own ceiling, checked here so a large paste fails before it is sent rather than
  // after. Anything bigger belongs in create_upload, which streams from a file.
  if (bytes.length > 5 * 1024 * 1024)
    throw new PassalongError(
      `that image is ${Math.round(bytes.length / 1024 / 1024)}MB and the limit is 5MB — ` +
        "write it to a file and use create_upload, which streams",
    );
  const label = name || "screenshot";
  const shot = await api.uploadShot(bytes, type, label);
  return { ...shot, markdown: `![${label}](${shot.url})` };
}

export async function attach(file, { name = "" } = {}) {
  if (!api.loggedIn())
    throw new PassalongError("attaching evidence needs sync — run `passalong login` first");
  if (!existsSync(file)) throw new PassalongError(`no file at ${file}`);
  const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
  const type = SHOT_TYPES[ext];
  if (!type)
    throw new PassalongError(
      `screenshots must be ${[...new Set(Object.values(SHOT_TYPES))].join(", ")} — ${ext || file} is not one`,
    );
  const shot = await api.uploadShot(readFileSync(file), type, name || basename(file));
  return { ...shot, markdown: `![${name || basename(file)}](${shot.url})` };
}

/**
 * What a file's extension suggests it is. A hint only: the server reads the bytes and decides, and
 * refuses what it does not keep. It exists so a `.csv` is filed as CSV and not as generic text.
 */
const FILE_HINTS = {
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".txt": "text/plain",
  ".log": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".md": "text/markdown",
};

/** The most the server keeps of one file. Mirrors ATTACH_MAX in apps/api/src/attachments.ts. */
const FILE_MAX = 10 * 1024 * 1024;

/**
 * Attach a file that is not a picture — a log, a PDF, a CSV, a zip — and return the markdown line that
 * points at it. For a guide body or a bug report, where an agent has the file and nothing else to
 * show it with. It is private: whoever can read the guide can download it, and nobody else can, so
 * it is not evidence on a page that travels by link.
 */
export async function attachFile(file, { name = "" } = {}) {
  if (!api.loggedIn())
    throw new PassalongError("attaching a file needs sync — run `passalong login` first");
  if (!existsSync(file)) throw new PassalongError(`no file at ${file}`);
  const bytes = readFileSync(file);
  if (!bytes.length) throw new PassalongError(`${file} is empty`);
  if (bytes.length > FILE_MAX)
    throw new PassalongError(
      `${file} is ${Math.round(bytes.length / 1024 / 1024)}MB and the limit is 10MB — send a link instead`,
    );
  const ext = file.includes(".") ? file.slice(file.lastIndexOf(".")).toLowerCase() : "";
  const label = (name || basename(file)).replace(/[[\]()]/g, "");
  const attachment = await api.uploadFile(bytes, FILE_HINTS[ext] || "", name || basename(file));
  return { ...attachment, markdown: `[${label}](${attachment.url})` };
}

/**
 * Write to whoever holds a guide, or leave a note on one nobody holds yet: an answer to a question,
 * or something thought of since. `files` are paths — a picture is uploaded as one and drawn in the
 * thread, anything else as a file to download — and each becomes a line of the message. The server
 * decides who may write and whether anyone is listening, and says so in words.
 */
export async function reply(ref, text, { files = [] } = {}) {
  needsSync("replying");
  const lines = [];
  for (const file of files) {
    const ext = file.includes(".") ? file.slice(file.lastIndexOf(".")).toLowerCase() : "";
    const got = SHOT_TYPES[ext] ? await attach(file) : await attachFile(file);
    lines.push(got.markdown);
  }
  const body = [String(text || "").trim(), ...lines].filter(Boolean).join("\n");
  if (!body) throw new PassalongError("say something, or attach a file");
  return api.reply(await resolveId(ref), body);
}

/**
 * The line a guide arrives with, saying what a follow-up is and how to write one.
 *
 * A follow-up is more context for a guide, written as its own guide with `parent` naming the
 * original — a missing detail, a step that needed explaining, what changed since, what someone
 * found doing it. Whoever opens the original, person or agent, gets its follow-ups with it, which
 * is why context belongs there rather than in a one-line verdict note.
 *
 * What an agent did and found working on the guide is not context for it: that is the hand-in,
 * and the note says so. It used to list "what you found doing it" among the things to publish, on
 * every `take`, while hand_in said a follow-up was not for answering — the agent followed the one
 * it read last, and the author got a second guide to review with the evidence inside it.
 *
 * Trailing, like the handoff nudge, so it never sits in front of the frontmatter. It is here and
 * not only in the server's instructions because an agent reads the payload it is working from and
 * skims everything else — the same reason the bug lead is inside the document. For a bug, the
 * context worth adding is usually the fix, when it is worth repeating somewhere else: that is a
 * transfer guide, and the bug is what it adds context to.
 */
export function followUpNote(meta = {}) {
  if (!meta.id) return "";
  if (meta.kind === "bug")
    return (
      "<!-- passalong: once this is fixed, if the fix is worth repeating somewhere else, that is " +
      "more context for this bug: publish it as a transfer guide with publish_guide " +
      `parent=${meta.id}, and whoever opens this bug gets it too. -->`
    );
  return (
    "<!-- passalong: a follow-up is more context for this guide, written as its own guide. If " +
    "this guide needs more — a missing detail, a step that needed explaining, what changed since " +
    `— publish that with publish_guide parent=${meta.id}, and whoever opens this guide gets it ` +
    "too. What you did and found working on it is not a follow-up: it goes on hand_in, in " +
    "`checks` and `writeup`. -->"
  );
}

/** What heads a guide's follow-ups when they are handed to an agent. Same words on both servers. */
export const FOLLOW_UPS_LEAD =
  "FOLLOW-UPS — more context added to this guide, oldest first. Read them before acting; where " +
  "one contradicts the original, the follow-up is newer.";

/**
 * A guide's follow-ups as the server lists them, oldest first, or [] when there are none, when
 * sync is off, or when anything goes wrong. Context is never worth failing a pull over: the guide
 * itself is what was asked for, and it is already in hand.
 *
 * Only with sync, because follow-ups live on the server and are scoped to what this account can
 * read — the same condition `resolve()` uses to look a guide up there. Fetching them records no
 * pull on them: reading context for a guide is not opening those guides.
 *
 * `markdown` asks for each one's content too (capped server-side). The api calls are injectable
 * so this can be tested without a network.
 */
export async function followUpGuides(
  meta = {},
  { markdown = false, children = api.children, loggedIn = api.loggedIn } = {},
) {
  if (!meta.id || !loggedIn()) return [];
  try {
    const { guides = [] } = await children(meta.id, { markdown });
    const listed = (Array.isArray(guides) ? guides : []).filter((g) => g?.id);
    // With content the server already sends oldest first; the plain listing is newest first.
    return markdown ? listed : listed.reverse();
  } catch {
    return [];
  }
}

/**
 * A guide's follow-ups with their content, formatted to go after the document for an agent — the
 * same shape the remote server's get_guide returns — or "" when there are none.
 */
export async function followUps(meta = {}, deps = {}) {
  const guides = (await followUpGuides(meta, { ...deps, markdown: true })).filter(
    (g) => typeof g.markdown === "string",
  );
  if (!guides.length) return "";
  return [
    FOLLOW_UPS_LEAD,
    ...guides.map(
      (g) => `--- follow-up ${g.id}: ${g.title || "untitled"} ---\n${g.markdown.trimEnd()}`,
    ),
  ].join("\n\n");
}

/**
 * The guide a follow-up came out of, formatted to go in front of it — or "" when there is none.
 *
 * Follow-ups travelled one way: opening a guide handed over what was written under it, and opening
 * one of those handed over nothing. An agent given a follow-up on its own reads a document that
 * assumes a piece of work it has never seen, and either goes looking for it or treats the note as
 * the whole job. Where the parent has got to is part of the context, not a separate question.
 *
 * The same shape the hosted server's parentOf() returns. Injectable for testing, and never worth
 * failing the call over: the guide itself is what was asked for.
 */
export async function parentGuide(
  meta = {},
  { parent = api.parent, loggedIn = api.loggedIn } = {},
) {
  if (!meta.id || !meta.parent || !loggedIn()) return "";
  try {
    const { guide } = await parent(meta.id, { markdown: true });
    if (!guide?.id) return "";
    const who = guide.by?.name || (guide.by?.handle ? `@${guide.by.handle}` : "");
    const state = guide.state === "held" && who ? `held by ${who}` : guide.state || "open";
    return (
      `THIS IS A FOLLOW-UP TO ${guide.id}: ${guide.title || "untitled"} — ${state}. It is more ` +
      "context for that guide, not a piece of work on its own. Read the guide it follows first; " +
      "it is below, and where the two disagree this follow-up is newer. If what it asks for " +
      `depends on ${guide.id} being done and it is not, say so rather than starting.\n\n` +
      `--- the guide it follows: ${guide.id} ---\n${String(guide.markdown ?? "").trimEnd()}\n\n`
    );
  } catch {
    return "";
  }
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
 * What you did, newest first: what you published, what you took delivery of, and every verdict and
 * ack you gave. The other half of `activity` — that one is what other people did to your guides and
 * it clears when you read it; this is your own record and it never clears.
 *
 * It is a record of what you passed along, not of what you worked on. Work that never became a
 * guide has no row, so anything printing this has to say so. Needs sync.
 */
export async function log({ repo = "", since = "" } = {}) {
  const res = await api.log({ repo, since });
  return res.log;
}

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
/**
 * Say whether a guide held, and why at the length that takes.
 *
 * The reason used to be one field, capped at 280 characters by the row it was written for — so an
 * agent that had run the Verification and found it did not hold published a guide called
 * "Correction: …" instead, because measurements, commands and commit ids do not fit in a tweet.
 * The first line is the summary a row shows; the whole thing is what the guide shows.
 */
export async function verdict(id, ok, note = "", { images = [] } = {}) {
  if (!api.loggedIn()) throw new PassalongError("verdicts need sync — run `passalong login` first");
  const said = note.trim();
  if (!ok && !said)
    throw new PassalongError("say what went wrong: passalong broken <id> <what happened>");
  // "It works" is shown, not said: the server refuses one with no screenshot of it working, so
  // the refusal is said here before anything is uploaded, in the words of the command that fixes it.
  if (ok && !images.length && !/\/v1\/shots\/[a-z0-9]{6,16}/.test(said))
    throw new PassalongError(
      "show it working: passalong works <id> <screenshot.png> [what you checked]",
    );
  const guide = await resolveId(id);
  const shots = [];
  for (const file of images) shots.push((await attach(file)).markdown);
  const line = said.split("\n")[0].slice(0, 280);
  const detail = [said.length > line.length || shots.length ? said : "", ...shots]
    .filter(Boolean)
    .join("\n");
  return api.verdict(guide, ok, line, detail);
}

/**
 * The words after `passalong works <id>`, split into the screenshots and the note: an argument is a
 * screenshot when it names an image file that exists, and everything else is what was checked.
 */
export function proofArgs(args) {
  const images = [];
  const words = [];
  for (const a of args) {
    const ext = a.slice(a.lastIndexOf(".")).toLowerCase();
    if (SHOT_TYPES[ext] && existsSync(a)) images.push(a);
    else words.push(a);
  }
  return { images, note: words.join(" ") };
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

/** Archive a guide (`consumed`) or put it back (`published`). The server refuses `promoted`. */
export async function setStatus(id, status) {
  if (!STATUSES.includes(status))
    throw new PassalongError(`status must be one of ${STATUSES.join(", ")}`);
  const { guide } = await resolve(id);
  const next = { ...guide, meta: { ...guide.meta, status } };
  // The server first. Saved the other way round, a refusal left the local copy saying what the
  // server had just refused — a teammate's `ready` on someone else's task read as done here.
  if (api.loggedIn() && guide.meta.url) await api.setStatus(id, status);
  store.save(next);
  return next;
}

/**
 * Move a task from Draft to Ready: a person has read it and an agent may take it.
 *
 * Only tasks. Every other kind is published the moment it is shared, so "ready" on one would
 * either do nothing or reopen something archived under a name that does not say so.
 */
export async function ready(id) {
  const { guide } = await resolve(id);
  if (guide.meta.kind !== "task")
    throw new PassalongError(`${guide.meta.id || id} is not a task — ready is for tasks in Draft`);
  if (guide.meta.status !== "draft")
    throw new PassalongError(`${guide.meta.id} is not in Draft (status: ${guide.meta.status})`);
  return setStatus(guide.meta.id, "published");
}

/**
 * One goal as several tasks, written as drafts in order. Each step may name the earlier steps it
 * needs by position (`after: [0, 1]`), and those become its `blocked_by`, so the queue hands them
 * out in an order that works and runs the independent ones side by side.
 *
 * Only earlier steps: a step that waits on itself or on a later one is a plan that never finishes,
 * and it is refused before anything is written rather than discovered as a queue that never moves.
 * Every step lands in Draft — a wrong decomposition is several agents building the wrong thing at
 * once, so a person reads the plan before any of it runs.
 */
export async function planTasks(steps, { cwd = process.cwd() } = {}) {
  if (!Array.isArray(steps) || !steps.length)
    throw new PassalongError("a plan needs at least one step");
  steps.forEach((step, i) => {
    for (const j of step.after || [])
      if (!Number.isInteger(j) || j < 0 || j >= i)
        throw new PassalongError(
          `step ${i} ("${step.title}") can only wait on an earlier step, not ${j}`,
        );
  });
  const repo = context(cwd).repo;
  const ids = [];
  for (const step of steps) {
    const section = (name, text) =>
      String(text || "").trim() ? [`## ${name}`, String(text).trim(), ""] : [];
    const body = [
      ...section("Goal", step.goal),
      ...section("Context", step.context),
      ...section("Constraints", step.constraints),
      ...section("Acceptance", step.acceptance),
      ...section("Out of scope", step.out_of_scope),
    ].join("\n");
    // The summary is the step's own, said by whoever planned it: it is what a person reads about the
    // task, and this builds the document without guessing one (the server refuses a task without).
    const meta = {
      title: step.title,
      summary: step.summary,
      kind: "task",
      target_context: step.target_context ?? repo,
    };
    const after = (step.after || []).map((j) => ids[j]);
    if (after.length) meta.blocked_by = after;
    ids.push((await share(serialize({ meta, body }), { cwd })).guide.meta.id);
  }
  return ids;
}

/** What an agent started by `work()` is told. The task itself goes in too, so it cannot start blind. */
export function workPrompt(t) {
  return [
    `You hold passalong task ${t.id}, and no other agent can take it while you do.`,
    `It is written to ${t.path}; here it is:`,
    "",
    t.markdown.trim(),
    "",
    "Do it in this repo. There are no Steps: work out how to reach Goal within Constraints, and",
    "leave Out of scope alone. Call the passalong MCP tool progress with id",
    `${t.id} and a one-line status at each milestone — 30 minutes of silence stalls the task.`,
    "When every Acceptance check holds, commit what you changed as one commit whose message",
    `starts with "${t.id}: " — several tasks share this worktree, and a reviewer reads each one's`,
    "change on its own. Then call hand_in with id",
    `${t.id}, \`pr\` set to that commit's hash, \`markdown\`: a transfer guide saying what you`,
    "did, what you decided and why, and how you checked each Acceptance line, and `evidence`:",
    "what you ran and what came back — the commands and the lines that decided it, the test",
    "summary, the commit. Keep that as you go; at the end you would be writing it from memory,",
    "and it is the one part of the hand-in a reviewer can check. If either call says you no",
    "longer hold the task, stop.",
    "",
    "Nobody reads what you print: this session runs unattended. If something only a person can",
    "do stands between you and an Acceptance line — a permission, a secret, a decision — call",
    `progress with id ${t.id} and a note starting "BLOCKED: " that says exactly what you`,
    "need, leave the task unfinished and uncommitted, and stop. The board shows that note.",
  ].join("\n");
}

/**
 * Work the queue from this worktree: take the next task, hand it to an agent, and when the agent
 * has finished it take the next, until there is nothing left.
 *
 * The agent runs in this worktree, so it is the same agent to the queue — its progress and
 * hand_in land on the claim this took. `agent` is a command the prompt is appended to;
 * `claude -p` by default, or whatever PASSALONG_AGENT says.
 *
 * An agent that exits without finishing stops the loop. Asking for the next task would hand the
 * same one back, since a worktree holds one task at a time, and the loop would run the agent on it
 * forever. The task stays claimed here, for the next run to resume or a person to release.
 */
export async function work({
  cwd = process.cwd(),
  agent = process.env.PASSALONG_AGENT || "claude -p",
  any = false,
  once = false,
  onTask = () => {},
} = {}) {
  needsSync("working the queue");
  const [command, ...args] = agent.trim().split(/\s+/);
  const finished = [];
  for (;;) {
    const t = await nextTask({ cwd, any });
    if (!t) return { finished, stopped: "empty" };
    onTask(t);
    const run = spawnSync(command, [...args, workPrompt(t)], {
      cwd,
      stdio: "inherit",
      env: { ...process.env, PASSALONG_TASK: t.id, PASSALONG_TASK_PATH: t.path },
    });
    const state = (await tasks()).find((x) => x.id === t.id)?.state;
    if (state !== "review")
      return {
        finished,
        stopped: "unfinished",
        task: t.id,
        state,
        exit: run.status ?? run.error?.message,
      };
    finished.push(t.id);
    if (once) return { finished, stopped: "once" };
  }
}

/**
 * Make every task you wrote that is still in Draft ready, and return their ids. For the moment a
 * planner has written several and you have read them all. Only your own: moving a task into the
 * queue is its author's call.
 */
export async function readyDrafts() {
  const drafts = (await tasks()).filter((t) => t.mine && t.state === "draft");
  for (const t of drafts) await ready(t.id);
  return drafts.map((t) => t.id);
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
