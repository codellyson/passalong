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
  });
});
