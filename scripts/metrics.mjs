// The four numbers in PRD §14, computed from D1.
//
//   node scripts/metrics.mjs --dev       # the database `pnpm dev` writes to
//   node scripts/metrics.mjs --remote    # production, read-only
//
// WHY THIS IS A SCRIPT AND NOT A ROUTE. These are product-wide figures, and the API has no
// product-wide reader: there are accounts and there are teams, and no third thing above them. An
// endpoint would therefore have to invent an admin credential, which is a new way into every
// account's data, added so one person can read four numbers. The operator already has `wrangler`
// and the database; this needs nothing that does not exist.
//
// It is also the only shape that keeps the analytics rule intact. `apps/api/src/analytics.ts` sends
// event names and categorical props and never an id, because a share key in a page URL must never
// reach a third party — which is correct, and which is exactly why Aptabase can never answer §14.
// Both of its per-account questions need sequences joined on who did what. Those joins happen here,
// against the database, and nothing leaves the machine that runs this.
//
// WHAT THE NUMBERS CANNOT SAY is printed with them, every run. Two of §14's bullets cannot be
// computed as written, and a report that quietly substitutes a near-miss is worse than one that
// says so.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

// REQUEUED in apps/api/src/claims.ts: the thread line that marks a hold the clock let go.
const REQUEUED = "went quiet; back in the queue";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const die = (msg) => {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
};

// ---- the queries ---------------------------------------------------------------------------
//
// Every one of them reads `work`, `pull`, `proof` and `task_event` — the rows the product already
// writes. Nothing here needs a table of its own, for the same reason `/v1/log` does not: a metric
// computed from a second copy of the truth is a second thing to keep in step.

const QUERIES = {
  // §14 activation: "first share to first pull in a different context within 7 days".
  //
  // A pull row is written for the puller whoever they are, so "different context" is read the way
  // §4 means it — the same person in another session counts, since the v1 persona is the sender and
  // receiver being one developer. Seven days from their first share.
  activation: `
    WITH first_share AS (
      SELECT account_id, MIN(created) AS at FROM work GROUP BY account_id
    ),
    first_pull AS (
      SELECT account_id, MIN(at) AS at FROM pull WHERE account_id <> '' GROUP BY account_id
    )
    SELECT COUNT(*) AS shared,
           SUM(CASE WHEN fp.at IS NOT NULL
                     AND julianday(fp.at) - julianday(fs.at) BETWEEN 0 AND 7
                    THEN 1 ELSE 0 END) AS activated
      FROM first_share fs
      LEFT JOIN first_pull fp ON fp.account_id = fs.account_id`,

  // §14 core health: "weekly crossings per active user (share + pull pairs)".
  // A share and a pull are both crossings here; an account is active in a week if it did either.
  health: `
    WITH ev AS (
      SELECT account_id, created AS at FROM work
      UNION ALL
      SELECT account_id, at FROM pull WHERE account_id <> ''
    )
    SELECT strftime('%Y week %W', at) AS week,
           COUNT(*) AS crossings,
           COUNT(DISTINCT account_id) AS people,
           ROUND(CAST(COUNT(*) AS REAL) / COUNT(DISTINCT account_id), 1) AS each
      FROM ev
     GROUP BY week
     ORDER BY week DESC
     LIMIT 8`,

  // §14 quality proxy: "percent of pulled work that came back with a passing proof, and how
  // many of those needed no follow-up edit".
  //
  // Not "marked done": `done` is the author's shelf, archived and reversible, and says nothing
  // about whether it worked. The proof is the better instrument: the reader's judgement rather
  // than the author's.
  //
  // "Without follow-up edits" survives intact: `work.updated` moving after a proof means the
  // author changed the document in response to it.
  quality: `
    SELECT COUNT(DISTINCT p.work_id) AS pulled,
           COUNT(DISTINCT CASE WHEN v.ok = 1 THEN v.work_id END) AS works,
           COUNT(DISTINCT CASE WHEN v.ok = 0 THEN v.work_id END) AS broken,
           COUNT(DISTINCT CASE WHEN v.ok = 1 AND g.updated <= v.at THEN v.work_id END) AS clean
      FROM pull p
      JOIN work g ON g.id = p.work_id
      LEFT JOIN proof v ON v.work_id = p.work_id
     WHERE p.account_id <> '' AND p.account_id <> g.account_id`,

  // Not §14. The queue of work (docs/WORK.md: every piece of work is on it), which none of the four
  // above can see.
  //
  // The four §14 numbers all read `work`, `pull` and `proof` — the share-and-pull loop. A task
  // is taken, worked and handed in through `claim`, and no metric read that table at all, so the
  // whole of V2 was invisible here.
  //
  // WHY THIS IS A SNAPSHOT AND THE OTHERS ARE RATES. A claim holds where a task is now, not where
  // it has been: `stalled` is derived on read rather than stored, and passing a task deletes its
  // claim and puts it back in Ready. So "how many were passed" cannot be answered from these
  // rows, and is not asked. What survives a full pass round the loop is the work's own status —
  // `done` is a task finished or archived — which is why `done` is the one cumulative figure
  // here.
  //
  // `blocked` is folded into `ready`: it needs `task_block`, and the distinction is about whether
  // what it waits on is Done, not about whether the queue is moving.
  tasks: `
    SELECT COUNT(*) AS tasks,
           SUM(CASE WHEN g.status = 'done' THEN 1 ELSE 0 END) AS done,
           SUM(CASE WHEN g.status = 'draft' THEN 1 ELSE 0 END) AS draft,
           SUM(CASE WHEN g.status = 'ready' AND c.work_id IS NULL THEN 1 ELSE 0 END) AS ready,
           SUM(CASE WHEN g.status = 'ready' AND c.state = 'claimed'
                     AND c.lease_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    THEN 1 ELSE 0 END) AS claimed,
           SUM(CASE WHEN g.status = 'ready' AND c.state = 'claimed'
                     AND c.lease_until <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    THEN 1 ELSE 0 END) AS stalled
      FROM work g
      LEFT JOIN claim c ON c.work_id = g.id`,

  // What a hand-in brought with it, which is the only thing here that says whether the gate works.
  //
  // Three shapes, in the order they were added. A block of `evidence` is what migration 0025 asked
  // for. `checks` (0028) is the same evidence sorted against the Acceptance line it answers. A
  // check carrying `cmd` was run by packages/passalong/src/checks.js rather than described, and its
  // exit code decided it — so `run` is the number that says whether the runner is doing anything,
  // and it starts at zero by construction.
  //
  // Read from `proof`, which complete() writes from each hand-in after its claim goes, so this is
  // cumulative rather than a picture of what is waiting right now.
  evidence: `
    SELECT COUNT(*) AS handed_in,
           SUM(CASE WHEN c.detail <> '' THEN 1 ELSE 0 END) AS with_evidence,
           SUM(CASE WHEN c.checks <> '' THEN 1 ELSE 0 END) AS sorted,
           SUM(CASE WHEN c.checks <> '' AND EXISTS (
                 SELECT 1 FROM json_each(c.checks)
                  WHERE json_extract(value, '$.cmd') IS NOT NULL
               ) THEN 1 ELSE 0 END) AS run
      FROM proof c`,

  // §14 v2: "percent of crossings that cross a person boundary".
  // Three kinds, and they are the whole of `pull`: somebody else took it, you took your own in
  // another context, or an anonymous share link was opened.
  crossing: `
    SELECT SUM(CASE WHEN p.account_id <> '' AND p.account_id <> g.account_id THEN 1 ELSE 0 END) AS crossed,
           SUM(CASE WHEN p.account_id = g.account_id THEN 1 ELSE 0 END) AS own,
           SUM(CASE WHEN p.account_id = '' THEN 1 ELSE 0 END) AS anon
      FROM pull p
      JOIN work g ON g.id = p.work_id`,

  // Not §14: docs/LOOP.md's number. What is being left behind right now, which should be zero.
  //
  // `quiet` is every hold whose lease has run out, any kind — the hourly sweep puts one back in
  // the queue two hours after its lease lapses, unless its agent is waiting on a person's answer,
  // so what stays here long is a question nobody answered. `untaken` is a piece of work sent to somebody
  // that nobody pulled, took, passed or proved in three days (`untaken()` in claims.ts, which tells
  // a person once and leaves it Ready). `requeued` and `stuck` are cumulative: how often the clock
  // let go of quiet work, and how many unfinished pieces of work it has let go of more than once.
  left: `
    SELECT
      (SELECT COUNT(*) FROM claim c JOIN work g ON g.id = c.work_id
        WHERE g.status = 'ready' AND c.state = 'claimed'
          AND c.lease_until <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AS quiet,
      (SELECT COUNT(*) FROM work g
        WHERE g.status = 'ready'
          AND g.updated <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')
          AND (g.to_account_id <> '' OR g.to_group_id <> '')
          AND NOT EXISTS (SELECT 1 FROM pull p WHERE p.work_id = g.id AND p.account_id <> g.account_id)
          AND NOT EXISTS (SELECT 1 FROM task_event e WHERE e.work_id = g.id AND e.kind = 'passed')
          AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.work_id = g.id)
          AND NOT EXISTS (SELECT 1 FROM proof v WHERE v.work_id = g.id)) AS untaken,
      (SELECT COUNT(*) FROM task_event WHERE kind = 'released' AND body = '${REQUEUED}') AS requeued,
      (SELECT COUNT(*) FROM (
         SELECT e.work_id FROM task_event e JOIN work g ON g.id = e.work_id
          WHERE e.kind = 'released' AND e.body = '${REQUEUED}' AND g.status <> 'done'
          GROUP BY e.work_id HAVING COUNT(*) >= 2)) AS stuck`,

  // Not a §14 figure: which releases are writing work now, so a malformed one can be traced to
  // the client that produced it. `client` is migration 0035, and "" is every row from before it.
  clients: `
    SELECT client, COUNT(*) AS work, MAX(updated) AS last
      FROM work
     GROUP BY client
     ORDER BY last DESC
     LIMIT 12`,
};

// ---- where the rows are --------------------------------------------------------------------

/**
 * The database `pnpm dev` writes to.
 *
 * Nitro manages its own D1 under .wrangler/state, and it is **not** the one `wrangler d1 ... --local`
 * reads — the sharp edge AGENTS.md records, whose symptom is `no such table: account`. The file is
 * named for the database_id, so it is found rather than hardcoded: the id changes and the old file
 * stays behind.
 */
function devDatabase() {
  const dir = join(root, "apps/web/.wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
  } catch {
    die(`no local D1 at ${dir} — run \`pnpm dev\` once to create it`);
  }
  if (!files.length)
    die("local D1 exists but holds no database — run `pnpm -C apps/api db:migrate`");
  if (files.length > 1)
    die(
      `${files.length} local databases in ${dir}; delete the stale ones (they are named by database_id)`,
    );
  return join(dir, files[0]);
}

const readDev = (db) => (sql) => db.prepare(sql).all();

/** Production, through wrangler. Read-only by inspection: every query above is a SELECT. */
const readRemote = () => (sql) => {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "passalong", "--remote", "--json", "--command", sql.trim()],
    { cwd: join(root, "apps/api"), encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  // wrangler answers with an array of statement results; one statement in, one result out.
  const parsed = JSON.parse(out);
  return (Array.isArray(parsed) ? parsed[0] : parsed)?.results ?? [];
};

// ---- the report ------------------------------------------------------------------------------

const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");
/** "1 crossing" / "2 crossings". A report that cannot count in English reads as one nobody checked. */
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

const rule = (title) => {
  console.log(`\n${title}`);
  console.log("─".repeat(title.length));
};

/** A caveat is part of the number, so it prints with it rather than in a footnote nobody reaches. */
const caveat = (text) => console.log(`  ⚠ ${text}`);

function report(read) {
  const [l] = read(QUERIES.left);
  rule("Left behind — right now (docs/LOOP.md: should be zero)");
  console.log(
    `  ${plural(l.quiet, "hold")} gone quiet · ${plural(l.untaken, "piece", "pieces")} of work sent and untaken for 3+ days`,
  );
  console.log(
    `  ${l.requeued} put back in the queue by the clock so far · ${l.stuck} unfinished put back more than once`,
  );
  caveat(
    "Tasks nobody took are not counted: a task for nobody in particular is a backlog, not a\n" +
      "    drop. Requeues start at zero on 2026-10-28, when the clock began letting go.",
  );

  const [act] = read(QUERIES.activation);
  rule("Activation");
  console.log(
    `  ${act.activated} of ${plural(act.shared, "account")} that shared also pulled within 7 days` +
      ` — ${pct(act.activated, act.shared)}`,
  );
  caveat(
    "Undercounts for CLIs before 2026-10-14, which served `passalong pull` from a local store\n" +
      "    without calling the API unless the work carried a team. Newer CLIs always call it.",
  );

  rule("Core health — crossings per active person, by week");
  const weeks = read(QUERIES.health);
  if (!weeks.length) console.log("  no crossings yet");
  for (const w of weeks) {
    const each = `${w.each} each`;
    console.log(
      `  ${w.week}   ${plural(w.crossings, "crossing").padStart(13)}   ${plural(w.people, "person", "people").padStart(10)}   ${each}`,
    );
  }

  const [q] = read(QUERIES.quality);
  rule("Quality — of work somebody else pulled");
  console.log(
    `  ${plural(q.pulled, "piece", "pieces")} of work pulled by someone other than their author`,
  );
  console.log(
    `  ${q.works} came back working (${pct(q.works, q.pulled)}), ${q.broken} came back broken (${pct(q.broken, q.pulled)})`,
  );
  console.log(`  ${q.clean} of the working ones needed no edit to the work afterwards`);
  // Subtraction nobody was doing. A pull with no proof is the loop's last step skipped, and it
  // is the largest number in this section as often as not.
  const silent = q.pulled - q.works - q.broken;
  console.log(
    `  ${silent} were pulled and never answered (${pct(silent, q.pulled)}) — no works, no broken`,
  );
  caveat(
    "Silence is not a proof either way. A piece of work nobody answered reads the same as one still\n" +
      "    being worked on, so this number is an upper bound on what was abandoned.",
  );

  const [t] = read(QUERIES.tasks);
  rule("The task queue — where tasks are now");
  if (!t.tasks) console.log("  no tasks yet");
  else {
    console.log(
      `  ${plural(t.tasks, "task")}: ${t.done} done · ` +
        `${t.claimed} being worked · ${t.stalled} stalled · ${t.ready} ready · ${t.draft} draft`,
    );
    caveat(
      "A snapshot, not a rate. A claim says where a task is now: `stalled` is derived on read,\n" +
        "    and passing one deletes its claim and puts it back in Ready, so how many were\n" +
        "    passed cannot be asked of these rows. `done` is the exception and is cumulative.",
    );
  }

  const [e] = read(QUERIES.evidence);
  rule("What hand-ins brought with them");
  if (!e.handed_in) console.log("  nothing handed in yet");
  else {
    console.log(`  ${plural(e.handed_in, "hand-in")}, of which:`);
    console.log(
      `  ${e.with_evidence} carried evidence (${pct(e.with_evidence, e.handed_in)}) · ` +
        `${e.sorted} sorted it against the Acceptance lines (${pct(e.sorted, e.handed_in)}) · ` +
        `${e.run} had a command run for them (${pct(e.run, e.handed_in)})`,
    );
    caveat(
      "The last figure is the one to watch, and it starts at zero: a check only carries `cmd`\n" +
        "    when an agent sends one, and packages/passalong/src/checks.js runs it. If it stays\n" +
        "    near zero the runner is decoration and the tool description is what to fix.",
    );
    caveat(
      "A hand-in the runner refused is not here. It is refused before the API is called, so\n" +
        "    nothing is written — which is right, and means the number this would most like to\n" +
        "    report, how many false 'done's were caught, cannot be counted at all.",
    );
    caveat(
      "Age reads as absence. A hand-in from before migration 0025 has no evidence to carry and\n" +
        "    one from before 0028 has no `checks`, so a low figure here may be history rather\n" +
        "    than a gap. `checks` is a task's shape besides: work sent to a person answers `ok`, not lines.",
    );
  }

  const [c] = read(QUERIES.crossing);
  const total = (c.crossed ?? 0) + (c.own ?? 0) + (c.anon ?? 0);
  rule("Crossings between people");
  console.log(
    `  ${plural(c.crossed ?? 0, "crossing")} crossed a person (${pct(c.crossed, total)})` +
      ` · ${c.own ?? 0} of your own · ${plural(c.anon ?? 0, "anonymous link")}`,
  );
  console.log(
    `\n  M2 asks for one external team crossing work weekly. The first figure is where to look.\n`,
  );

  rule("What wrote them, by last write");
  for (const r of read(QUERIES.clients))
    console.log(
      `  ${(r.client || "unknown").padEnd(18)} ${plural(r.work, "piece", "pieces")} of work · last ${String(r.last).slice(0, 10)}`,
    );
  caveat('"unknown" is all work last written before migration 0035 recorded it.');
  console.log("");
}

// ---- go ---------------------------------------------------------------------------------------

const where = process.argv[2];
if (where === "--dev") {
  const db = new DatabaseSync(devDatabase(), { readOnly: true });
  report(readDev(db));
  db.close();
} else if (where === "--remote") {
  report(readRemote());
} else {
  die("usage: node scripts/metrics.mjs --dev | --remote");
}
