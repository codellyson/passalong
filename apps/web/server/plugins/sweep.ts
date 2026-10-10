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
import { closeGuide, STALE_SENT_MS, staleSent, stalled } from "#api/claims";
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

    /**
     * Guides sent to somebody that nothing ever happened to.
     *
     * Leaving `Open` needs the receiver to open it and say it worked. When they never do, the
     * author is the one person who knows and the only exits are a menu item three levels down or
     * nothing at all — so a board fills with work that was finished weeks ago and a free plan
     * fills with it too.
     *
     * Both sides are told, including the author: this happened without them, and a guide that
     * left the board silently is worse than one that stayed. `consumed` is reversible, and the
     * notification is how somebody knows there is something to reverse.
     */
    try {
      const at = new Date().toISOString();
      const before = new Date(Date.now() - STALE_SENT_MS).toISOString();
      const old = await staleSent(env.DB as D1Database, before);
      for (const g of old) {
        const done = await closeGuide(env.DB as D1Database, g.id, { account: g.account_id, at });
        if ("error" in done) continue;
        for (const to of [g.account_id, g.to].filter(Boolean))
          await notify(env as Parameters<typeof notify>[0], {
            to,
            kind: "shelved",
            guide_id: g.id,
            actor_id: "",
            team_id: g.team_id,
            note: "not opened for a fortnight; put it back from Activities if it is still live",
          });
      }
      if (old.length) console.log(`closed ${old.length} sent guide(s) nobody opened`);
    } catch (err) {
      console.error("stale close failed", err);
    }
  });
});
