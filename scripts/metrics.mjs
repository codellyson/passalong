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

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const die = (msg) => {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
};

// ---- the queries ---------------------------------------------------------------------------
//
// Every one of them reads `guide`, `pull`, `verdict` and `ack` — the rows the product already
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
      SELECT account_id, MIN(created) AS at FROM guide GROUP BY account_id
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

  // §14 core health: "weekly transfers per active user (share + pull pairs)".
  // A share and a pull are both transfers here; an account is active in a week if it did either.
  health: `
    WITH ev AS (
      SELECT account_id, created AS at FROM guide
      UNION ALL
      SELECT account_id, at FROM pull WHERE account_id <> ''
    )
    SELECT strftime('%Y week %W', at) AS week,
           COUNT(*) AS transfers,
           COUNT(DISTINCT account_id) AS people,
           ROUND(CAST(COUNT(*) AS REAL) / COUNT(DISTINCT account_id), 1) AS each
      FROM ev
     GROUP BY week
     ORDER BY week DESC
     LIMIT 8`,

  // §14 quality proxy: "percent of pulled guides that came back with a passing verdict, and how
  // many of those needed no follow-up edit".
  //
  // It used to ask for guides "marked consumed", and this printed a warning that the number was a
  // substitution. `consumed` stopped meaning implemented — it is the author's shelf, archived and
  // reversible — so §14 was rewritten around the verdict, which is the better instrument anyway:
  // the reader's judgement rather than the author's. The warning outlived the disagreement it
  // described and was telling operators a number was a stand-in when it is the metric as written.
  //
  // "Without follow-up edits" survives intact: `guide.updated` moving after a verdict means the
  // author changed the document in response to it.
  quality: `
    SELECT COUNT(DISTINCT p.guide_id) AS pulled,
           COUNT(DISTINCT CASE WHEN v.ok = 1 THEN v.guide_id END) AS works,
           COUNT(DISTINCT CASE WHEN v.ok = 0 THEN v.guide_id END) AS broken,
           COUNT(DISTINCT CASE WHEN v.ok = 1 AND g.updated <= v.at THEN v.guide_id END) AS clean
      FROM pull p
      JOIN guide g ON g.id = p.guide_id
      LEFT JOIN verdict v ON v.guide_id = p.guide_id
     WHERE p.account_id <> '' AND p.account_id <> g.account_id`,

  // Not §14. The task queue, which none of the four above can see.
  //
  // The four §14 numbers all read `guide`, `pull` and `verdict` — the share-and-pull loop. A task
  // is taken, worked and handed in through `claim`, and no metric read that table at all, so the
  // whole of V2 was invisible here.
  //
  // WHY THIS IS A SNAPSHOT AND THE OTHERS ARE RATES. A claim holds where a task is now, not where
  // it has been: `stalled` is derived on read rather than stored, and rejecting a task deletes its
  // claim and puts it back in Ready. So "how many were rejected" cannot be answered from these
  // rows, and is not asked. What survives a full pass round the loop is the guide's own status —
  // `consumed` is a task its author approved — which is why `done` is the one cumulative figure
  // here.
  //
  // `blocked` is folded into `ready`: it needs `task_block`, and the distinction is about whether
  // a person has approved what it waits on, not about whether the queue is moving.
  tasks: `
    SELECT COUNT(*) AS tasks,
           SUM(CASE WHEN g.status = 'consumed' THEN 1 ELSE 0 END) AS done,
           SUM(CASE WHEN g.status = 'draft' THEN 1 ELSE 0 END) AS draft,
           SUM(CASE WHEN g.status = 'published' AND c.guide_id IS NULL THEN 1 ELSE 0 END) AS ready,
           SUM(CASE WHEN g.status = 'published' AND c.state = 'claimed'
                     AND c.lease_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    THEN 1 ELSE 0 END) AS claimed,
           SUM(CASE WHEN g.status = 'published' AND c.state = 'claimed'
                     AND c.lease_until <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    THEN 1 ELSE 0 END) AS stalled,
           SUM(CASE WHEN g.status = 'published' AND c.state = 'review' THEN 1 ELSE 0 END) AS review
      FROM guide g
      LEFT JOIN claim c ON c.guide_id = g.id AND c.place = ''
     WHERE g.kind = 'task'`,

  // What a hand-in brought with it, which is the only thing here that says whether the gate works.
  //
  // Three shapes, in the order they were added. A block of `evidence` is what migration 0025 asked
  // for. `checks` (0028) is the same evidence sorted against the Acceptance line it answers. A
  // check carrying `cmd` was run by packages/passalong/src/checks.js rather than described, and its
  // exit code decided it — so `run` is the number that says whether the runner is doing anything,
  // and it starts at zero by construction.
  //
  // Every claim that reached `review` is counted, including tasks since approved: the claim row
  // survives approval, so this is cumulative rather than a picture of what is waiting right now.
  evidence: `
    SELECT COUNT(*) AS handed_in,
           SUM(CASE WHEN c.evidence <> '' THEN 1 ELSE 0 END) AS with_evidence,
           SUM(CASE WHEN c.checks <> '' THEN 1 ELSE 0 END) AS sorted,
           SUM(CASE WHEN c.checks <> '' AND EXISTS (
                 SELECT 1 FROM json_each(c.checks)
                  WHERE json_extract(value, '$.cmd') IS NOT NULL
               ) THEN 1 ELSE 0 END) AS run
      FROM claim c
     WHERE c.state = 'review'`,

  // §14 v2: "percent of transfers that cross a person boundary".
  // Three kinds, and they are the whole of `pull`: somebody else took it, you took your own in
  // another context, or an anonymous share link was opened.
  crossing: `
    SELECT SUM(CASE WHEN p.account_id <> '' AND p.account_id <> g.account_id THEN 1 ELSE 0 END) AS crossed,
           SUM(CASE WHEN p.account_id = g.account_id THEN 1 ELSE 0 END) AS own,
           SUM(CASE WHEN p.account_id = '' THEN 1 ELSE 0 END) AS anon
      FROM pull p
      JOIN guide g ON g.id = p.guide_id`,
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
/** "1 transfer" / "2 transfers". A report that cannot count in English reads as one nobody checked. */
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

const rule = (title) => {
  console.log(`\n${title}`);
  console.log("─".repeat(title.length));
};

/** A caveat is part of the number, so it prints with it rather than in a footnote nobody reaches. */
const caveat = (text) => console.log(`  ⚠ ${text}`);

function report(read) {
  const [act] = read(QUERIES.activation);
  rule("Activation");
  console.log(
    `  ${act.activated} of ${plural(act.shared, "account")} that shared also pulled within 7 days` +
      ` — ${pct(act.activated, act.shared)}`,
  );
  caveat(
    "Undercounts. `passalong pull` serves a guide from the local store without calling the API\n" +
      "    unless it carries a team, so pulling your own teamless guide in another repo — the v1\n" +
      "    loop exactly — leaves no row to count.",
  );

  rule("Core health — transfers per active person, by week");
  const weeks = read(QUERIES.health);
  if (!weeks.length) console.log("  no transfers yet");
  for (const w of weeks) {
    const each = `${w.each} each`;
    console.log(
      `  ${w.week}   ${plural(w.transfers, "transfer").padStart(13)}   ${plural(w.people, "person", "people").padStart(10)}   ${each}`,
    );
  }

  const [q] = read(QUERIES.quality);
  rule("Quality — of guides somebody else pulled");
  console.log(`  ${plural(q.pulled, "guide")} pulled by someone other than their author`);
  console.log(
    `  ${q.works} came back working (${pct(q.works, q.pulled)}), ${q.broken} came back broken (${pct(q.broken, q.pulled)})`,
  );
  console.log(`  ${q.clean} of the working ones needed no edit to the guide afterwards`);
  // Subtraction nobody was doing. A pull with no verdict is the loop's last step skipped, and it
  // is the largest number in this section as often as not.
  const silent = q.pulled - q.works - q.broken;
  console.log(
    `  ${silent} were pulled and never answered (${pct(silent, q.pulled)}) — no works, no broken`,
  );
  caveat(
    "Silence is not a verdict either way. A guide nobody answered reads the same as one still\n" +
      "    being worked on, so this number is an upper bound on what was abandoned.",
  );

  const [t] = read(QUERIES.tasks);
  rule("The task queue — where tasks are now");
  if (!t.tasks) console.log("  no tasks yet");
  else {
    console.log(
      `  ${plural(t.tasks, "task")}: ${t.done} approved · ${t.review} waiting on a person · ` +
        `${t.claimed} being worked · ${t.stalled} stalled · ${t.ready} ready · ${t.draft} draft`,
    );
    caveat(
      "A snapshot, not a rate. A claim says where a task is now: `stalled` is derived on read,\n" +
        "    and rejecting one deletes its claim and puts it back in Ready, so how many were\n" +
        "    rejected cannot be asked of these rows. `done` is the exception and is cumulative.",
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
        "    than a gap. `checks` is a task's shape besides: a handoff answers `ok`, not lines.",
    );
  }

  const [c] = read(QUERIES.crossing);
  const total = (c.crossed ?? 0) + (c.own ?? 0) + (c.anon ?? 0);
  rule("Transfers that cross a person");
  console.log(
    `  ${plural(c.crossed ?? 0, "transfer")} crossed a person (${pct(c.crossed, total)})` +
      ` · ${c.own ?? 0} of your own · ${plural(c.anon ?? 0, "anonymous link")}`,
  );
  console.log(
    `\n  M2 asks for one external team transferring weekly. The first figure is where to look.\n`,
  );
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
