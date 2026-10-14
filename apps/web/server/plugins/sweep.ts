// The nightly tidy-up.
//
// `cloudflare_module` — the preset this app builds with — exports a `scheduled` handler that calls
// this hook on every cron tick, so a scheduled job needs no experimental Nitro tasks and no second
// Worker: it is a plugin and a `triggers.crons` line in wrangler.jsonc.
//
// Screenshots leave two ways here: the upload nobody ever referenced, which nothing else is in a
// position to notice, and the proof on a guide closed long enough ago that nobody is reviewing it.
// Everything else about a shot is handled where it happens — claimed when the guide naming it is
// written, deleted with that guide.

import { sweepAttachments } from "#api/attachments";
import {
  backToDraft,
  DRAFT_NUDGE_MS,
  STALE_SENT_MS,
  staleDrafts,
  staleSent,
  stalled,
} from "#api/claims";
import { notify } from "#api/notify";
import { DYNAMIC_TTL_MS } from "#api/oauth";
import { registrationCutoff, sweepRegistrations } from "#api/oauth-clients";
import { PROOF_DAYS, sweepOrphans, sweepProof } from "#api/shots";

/**
 * How far back a run looks for leases that have just lapsed. Wider than the gap between ticks in
 * wrangler.jsonc (hourly), so a run missed by a deploy is covered by the next one.
 */
const STALL_WINDOW_MS = 90 * 60 * 1000;

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook("cloudflare:scheduled", async (payload: { env?: unknown }) => {
    const env = payload?.env as { DB?: unknown; SHOTS?: unknown } | undefined;
    // No binding means this is not the deployment that owns the data — do nothing rather than
    // throwing inside a handler nobody is watching.
    if (!env?.DB) return;
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
    // Proof on guides closed more than PROOF_DAYS ago: the screenshots somebody attached to say it
    // works. They were for the review, and the review is over. See sweepProof in shots.ts.
    try {
      const { removed } = await sweepProof(env as Parameters<typeof sweepProof>[0]);
      if (removed)
        console.log(
          `removed ${removed} proof screenshot(s) from guides closed ${PROOF_DAYS}+ days ago`,
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
     * sentence would name a person as having done something to the guide, and with the author's
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
      const quiet = await stalled(env.DB as D1Database, at, since);
      for (const s of quiet)
        await notify(env as Parameters<typeof notify>[0], {
          to: s.author,
          kind: "stalled",
          guide_id: s.guide_id,
          actor_id: "",
          // The last thing its agent said, when it said anything — which is the most useful thing
          // to put in front of somebody deciding whether to release it. Where it was running is
          // the fallback, and a person who took it in the browser has neither.
          note: s.note || (s.where ? `last seen at ${s.where}` : ""),
        });
      if (quiet.length) console.log(`told about ${quiet.length} stalled hold(s)`);
    } catch (err) {
      console.error("stall notice failed", err);
    }

    // Guides left in Draft for a day. Draft is where every guide starts, and one its author meant to
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
          guide_id: g.id,
          actor_id: "",
          team_id: g.team_id,
        });
      if (drafts.length) console.log(`reminded about ${drafts.length} draft(s)`);
    } catch (err) {
      console.error("draft reminder failed", err);
    }

    /**
     * Guides sent to somebody that nothing ever happened to.
     *
     * Ready work nobody took sits in To do waiting on somebody who is not coming, and fills a free
     * plan too (Draft is not counted). After a fortnight it goes back to Draft — not to Done, which
     * is finished work — and its author marks it Ready again, for the same person or another.
     *
     * Both sides are told, including the author: this happened without them, and a guide that
     * moved silently is worse than one that stayed.
     */
    try {
      const before = new Date(Date.now() - STALE_SENT_MS).toISOString();
      const old = await staleSent(env.DB as D1Database, before);
      for (const g of old) {
        if (!(await backToDraft(env.DB as D1Database, g.id))) continue;
        for (const to of [g.account_id, g.to].filter(Boolean))
          await notify(env as Parameters<typeof notify>[0], {
            to,
            kind: "shelved",
            guide_id: g.id,
            actor_id: "",
            team_id: g.team_id,
            note: "nobody took it in a fortnight; mark it Ready again if it is still wanted",
          });
      }
      if (old.length) console.log(`put ${old.length} sent guide(s) nobody took back in Draft`);
    } catch (err) {
      console.error("stale close failed", err);
    }
  });
});
