// The nightly tidy-up.
//
// `cloudflare_module` — the preset this app builds with — exports a `scheduled` handler that calls
// this hook on every cron tick, so a scheduled job needs no experimental Nitro tasks and no second
// Worker: it is a plugin and a `triggers.crons` line in wrangler.jsonc.
//
// The only thing it does is delete screenshots no guide ever claimed. Everything else about a shot
// is handled where it happens — claimed when the guide naming it is written, deleted with that
// guide — and the leftover case is the upload nobody ever referenced, which nothing else is in a
// position to notice.
import { stalled } from "#api/claims";
import { notify } from "#api/notify";
import { DYNAMIC_TTL_MS } from "#api/oauth";
import { registrationCutoff, sweepRegistrations } from "#api/oauth-clients";
import { sweepOrphans } from "#api/shots";

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
      const at = new Date().toISOString();
      const quiet = await stalled(env.DB as D1Database, at);
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
  });
});
