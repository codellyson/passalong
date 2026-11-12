// Pushes and team channel posts, sent a burst at a time.
//
// An event no longer sends its push or its channel post the moment it happens: it is queued
// (notice_outbox, 0077), and this tick, every minute, sends each person's queued pushes as one push
// and each team's queued posts as one message, once the burst has gone quiet for half a minute or
// has waited three. Twelve pieces of work shared at once were twelve cards in a team's Google Chat
// and twelve buzzes on a phone (2026-11-06). See flushNotices in apps/api/src/notify.ts.
//
// The same tick sends the next batch of the admin hub's campaigns (sendCampaigns, announcements.ts).

import { flushNotices, sendCampaigns } from "#api/index";

/** The cron in wrangler.jsonc that sends the queue. The hourly one runs the sweeps (sweep.ts). */
export const EVERY_MINUTE = "* * * * *";

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook(
    "cloudflare:scheduled",
    async (payload: { env?: unknown; controller?: { cron?: string } }) => {
      if (payload?.controller?.cron !== EVERY_MINUTE) return;
      const env = payload?.env as { DB?: unknown } | undefined;
      if (!env?.DB) return;
      try {
        const sent = await flushNotices(env as Parameters<typeof flushNotices>[0]);
        // Only when a batch held more than one, so the tail shows the batching working.
        if (sent.notices > sent.pushes + sent.posts)
          console.log(
            `sent ${sent.notices} notices as ${sent.pushes} push(es) and ${sent.posts} post(s)`,
          );
      } catch (err) {
        console.error("notice flush failed", err);
      }
      try {
        const n = await sendCampaigns(env as Parameters<typeof sendCampaigns>[0]);
        if (n) console.log(`sent ${n} campaign mail(s)`);
      } catch (err) {
        console.error("campaign send failed", err);
      }
    },
  );
});
