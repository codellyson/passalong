// The nightly tidy-up.
//
// `cloudflare_module` — the preset this app builds with — exports a `scheduled` handler that calls
// this hook on every cron tick, so a scheduled job needs no experimental Nitro tasks and no second
// Worker: it is a plugin and a `triggers.crons` line in wrangler.jsonc.
//
// Screenshots leave two ways here: the upload nobody ever referenced, which nothing else is in a
// position to notice, and the proof on a piece of work closed long enough ago that nobody is reviewing it.
// Everything else about a shot is handled where it happens — claimed when the work naming it is
// written, deleted with that work.

import { alertPeople, mailUntaken } from "#api/alerts";
import { sweepAttachments } from "#api/attachments";
import { modeOf } from "#api/billing";
import {
  DRAFT_NUDGE_MS,
  fileUnfiled,
  REQUEUE_AFTER_MS,
  requeueStalled,
  staleDrafts,
  stalled,
  UNTAKEN_MAIL_HOUR,
  untaken,
} from "#api/claims";
import { notify, notifyAll } from "#api/notify";
import { DYNAMIC_TTL_MS } from "#api/oauth";
import { registrationCutoff, sweepRegistrations } from "#api/oauth-clients";
import { plansEnding } from "#api/quota";
import { PROOF_DAYS, sweepOrphans, sweepProof } from "#api/shots";
import { EVERY_MINUTE } from "./notices";

/**
 * How far back a run looks for leases that have just lapsed. Wider than the gap between ticks in
 * wrangler.jsonc (hourly), so a run missed by a deploy is covered by the next one.
 */
const STALL_WINDOW_MS = 90 * 60 * 1000;

/**
 * Holds that stayed quiet, put back in the queue (docs/LOOP.md): a stalled card used to stay locked
 * until a person released it, and nothing made sure one would. The author hears it in the feed the
 * first time; the second time the work is not getting done by whoever picks it up, so the author is
 * mailed and asked to step in.
 *
 * Every minute, not hourly (2026-11-07): work must not sit quiet. An agent at work renews its hold
 * from the tool hook, so a hold half an hour past its end belongs to an agent that stopped, and an
 * hourly tick added up to another hour on top.
 */
async function putBackQuiet(env: { DB?: unknown }) {
  try {
    const now = Date.now();
    const back = await requeueStalled(
      env.DB as D1Database,
      new Date(now).toISOString(),
      new Date(now - REQUEUE_AFTER_MS).toISOString(),
    );
    for (const r of back) {
      const e = {
        kind: "requeued" as const,
        work_id: r.work_id,
        actor_id: "",
        team_id: r.team_id,
      };
      if (r.times < 2) await notify(env as Parameters<typeof notify>[0], { ...e, to: r.author });
      else
        await alertPeople(
          env as Parameters<typeof alertPeople>[0],
          [r.author],
          { ...e, kind: "stuck" },
          "Work keeps going quiet",
          r.title,
        );
    }
    if (back.length) console.log(`put ${back.length} quiet hold(s) back in the queue`);
  } catch (err) {
    console.error("requeue failed", err);
  }
}

/**
 * Open work in no project, filed a batch at a time (claims.fileUnfiled): work from before every
 * piece of work had a project, and anything that arrived by a road that does not file it.
 */
async function fileOpenWork(env: { DB?: unknown }) {
  try {
    const filed = await fileUnfiled(env.DB as D1Database, new Date().toISOString());
    if (filed) console.log(`filed ${filed} piece(s) of open work into projects`);
  } catch (err) {
    console.error("filing open work failed", err);
  }
}

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook(
    "cloudflare:scheduled",
    async (payload: { env?: unknown; controller?: { cron?: string } }) => {
      const env = payload?.env as { DB?: unknown; SHOTS?: unknown } | undefined;
      // No binding means this is not the deployment that owns the data — do nothing rather than
      // throwing inside a handler nobody is watching.
      if (!env?.DB) return;
      // The once-a-minute tick sends queued notices (notices.ts) and puts quiet work back; the rest
      // of the sweeps are hourly.
      if (payload?.controller?.cron === EVERY_MINUTE) {
        await putBackQuiet(env);
        await fileOpenWork(env);
        return;
      }
      try {
        const { swept } = await sweepOrphans(env as Parameters<typeof sweepOrphans>[0]);
        // One line, and only when it did something. A cron that logs every night it found nothing
        // teaches whoever reads the tail to stop reading it.
        if (swept) console.log(`swept ${swept} unclaimed screenshot${swept === 1 ? "" : "s"}`);
      } catch (err) {
        console.error("shot sweep failed", err);
      }
      try {
        const { swept } = await sweepAttachments(env as Parameters<typeof sweepAttachments>[0]);
        if (swept) console.log(`swept ${swept} unclaimed file${swept === 1 ? "" : "s"}`);
      } catch (err) {
        console.error("file sweep failed", err);
      }
      // Proof on work closed more than PROOF_DAYS ago: the screenshots somebody attached to say it
      // works. They were for the review, and the review is over. See sweepProof in shots.ts.
      try {
        const { removed } = await sweepProof(env as Parameters<typeof sweepProof>[0]);
        if (removed)
          console.log(
            `removed ${removed} proof screenshot(s) from work closed ${PROOF_DAYS}+ days ago`,
          );
      } catch (err) {
        console.error("proof sweep failed", err);
      }
      // OAuth clients that registered themselves and were never approved. Also swept lazily on each
      // registration; this catches the quiet days when nothing registers.
      try {
        await sweepRegistrations(
          env.DB as D1Database,
          registrationCutoff(new Date(), DYNAMIC_TTL_MS),
        );
      } catch (err) {
        console.error("registration sweep failed", err);
      }

      /**
       * Work that has gone quiet, told to the person who can do something about it.
       *
       * `stalled` is derived on read and never stored, which is the right call — storing it would
       * need exactly this. The cost was that nothing could announce it: the state existed only while
       * somebody had the hub open, so a card sat held until its author happened to look.
       *
       * Nothing is released. A lapsed lease still holds its card; this only stops the noticing being
       * a person's job. And no `mail` is passed, so it lands in the in-app feed and goes nowhere
       * else — a nightly email about a card somebody is probably still working on is how a
       * notification channel gets muted.
       *
       * `actor_id` is deliberately empty. Nobody did this; a lease ran out. With an actor the
       * sentence would name a person as having done something to the work, and with the author's
       * own account it would be suppressed as self-inflicted — which is the commonest case of all,
       * somebody's own agent going quiet on their own task.
       */
      try {
        const now = Date.now();
        const at = new Date(now).toISOString();
        // Ninety minutes against an hourly tick. Each lease is returned in the one run it crosses
        // into silence, and the half-hour of overlap means a tick missed by a deploy still catches
        // what lapsed during it rather than losing the notice for good.
        const since = new Date(now - STALL_WINDOW_MS).toISOString();
        // Only holds waiting on an answer (2026-11-07). Any other quiet hold goes back to the queue
        // within the hour and its author hears that (putBackQuiet below), so a "gone quiet" line
        // first would say the same thing twice. A question unanswered for a day is not put back —
        // its context is the agent's — so it is said again, by mail this time: nothing moves until
        // someone answers. Once per question: the window returns each lease in one run.
        const quiet = (await stalled(env.DB as D1Database, at, since)).filter((s) => s.asking);
        for (const s of quiet)
          await alertPeople(
            env as Parameters<typeof alertPeople>[0],
            [s.author],
            {
              kind: "asked",
              work_id: s.work_id,
              actor_id: s.holder,
              team_id: s.team_id,
              note: s.asking,
            },
            "Your agent has waited a day for an answer",
            s.title,
            { everyTime: true, more: "Nothing moves on it until someone answers." },
          );
        if (quiet.length) console.log(`reminded about ${quiet.length} unanswered question(s)`);
      } catch (err) {
        console.error("stall notice failed", err);
      }

      // Work left in Draft for a day. Draft is where every piece of work starts, and one its author meant to
      // send sits there with nothing saying so. Feed only, no mail, like a stall notice.
      try {
        const now = Date.now();
        const before = new Date(now - DRAFT_NUDGE_MS).toISOString();
        const since = new Date(now - DRAFT_NUDGE_MS - STALL_WINDOW_MS).toISOString();
        const drafts = await staleDrafts(env.DB as D1Database, before, since);
        for (const g of drafts)
          await notify(env as Parameters<typeof notify>[0], {
            to: g.account_id,
            kind: "still_draft",
            work_id: g.id,
            actor_id: "",
            team_id: g.team_id,
          });
        if (drafts.length) console.log(`reminded about ${drafts.length} draft(s)`);
      } catch (err) {
        console.error("draft reminder failed", err);
      }

      /**
       * Work sent to somebody that nothing ever happened to. They stay Ready, and the people who can move them are
       * told every day until someone acts: the author and the team's owners. The feed and the phone
       * hear each piece in the run that finds it; the mail is one a day, below.
       */
      try {
        // Exactly the gap between ticks: a wider window would remind twice some days, and a reminder
        // that repeats daily can afford to miss the day a deploy ate.
        const left = await untaken(env.DB as D1Database, new Date().toISOString(), 60 * 60 * 1000);
        for (const g of left) {
          const { results: owners } = g.team_id
            ? await (env.DB as D1Database)
                .prepare("SELECT account_id FROM membership WHERE team_id = ? AND role = 'owner'")
                .bind(g.team_id)
                .all<{ account_id: string }>()
            : { results: [] };
          // No `mail` here: a piece mailed from whichever run found it was one mail per piece, each on
          // its own clock. mailUntaken gathers them.
          await notifyAll(
            env as Parameters<typeof notifyAll>[0],
            [...new Set([g.account_id, ...owners.map((o) => o.account_id)])],
            { kind: "untaken", work_id: g.id, actor_id: "", team_id: g.team_id },
          );
        }
        if (left.length) console.log(`told about ${left.length} work(s) nobody took`);
      } catch (err) {
        console.error("untaken notice failed", err);
      }

      // Once a day, after this run's notices are written so a piece found this hour is in today's mail:
      // one mail per person listing every piece nobody took that they have not been mailed about. A
      // morning a deploy eats is mailed the next one; nothing is marked until its mail is sent.
      if (new Date().getUTCHours() === UNTAKEN_MAIL_HOUR) {
        const mailed = await mailUntaken(env as Parameters<typeof mailUntaken>[0]);
        if (mailed) console.log(`mailed ${mailed} person(s) about work nobody took`);
      }

      // A plan that will end rather than renew, a week before and the day before (plansEnding in
      // quota.ts): a person's Solo to them, a team's to its owners, by feed, push and mail. One that
      // renews is never here. Exactly the gap between ticks, like the untaken notice: each is said in
      // one run, and a run a deploy ate is a reminder missed rather than one said twice.
      try {
        const at = new Date().toISOString();
        const ending = await plansEnding(env.DB as D1Database, at, 60 * 60 * 1000);
        const origin = String(
          (env as { PUBLIC_ORIGIN?: string }).PUBLIC_ORIGIN || "https://passalong.dev",
        ).replace(/\/$/, "");
        const paying =
          modeOf(String((env as { BACHS_SECRET?: string }).BACHS_SECRET || "")) !== "unset";
        for (const p of ending) {
          const on = new Date(p.ends).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          });
          const when = p.days === 1 ? `tomorrow, on ${on}` : `in ${p.days} days, on ${on}`;
          const soon = p.days === 1 ? "tomorrow" : "in a week";
          const owners =
            p.of === "account"
              ? [p.id]
              : (
                  await (env.DB as D1Database)
                    .prepare(
                      "SELECT account_id FROM membership WHERE team_id = ? AND role = 'owner'",
                    )
                    .bind(p.id)
                    .all<{ account_id: string }>()
                ).results.map((o) => o.account_id);
          await alertPeople(
            env as Parameters<typeof alertPeople>[0],
            owners,
            { kind: "plan_ending", actor_id: "", team_id: p.of === "team" ? p.id : "", note: when },
            p.of === "team" ? `${p.name}'s Team plan ends ${soon}` : `Your Solo plan ends ${soon}`,
            "",
            {
              everyTime: true,
              link: {
                url: `${origin}/hub/settings/${p.of === "team" ? "teams" : "plan"}`,
                label: paying ? (p.given ? "Choose a plan" : "Manage billing") : "Open Settings",
              },
              more: p.given
                ? "It was given, so it lapses then rather than renewing. Nothing is taken away."
                : "It was cancelled, so it stops then rather than renewing. Nothing is taken away; resume it to keep it.",
            },
          );
        }
        if (ending.length) console.log(`told about ${ending.length} plan(s) ending`);
      } catch (err) {
        console.error("plan ending notice failed", err);
      }
    },
  );
});
