// Alerts by email. `cloudflare_module` exports an `email` handler that calls this hook for every
// message Email Routing hands the Worker, so receiving mail is a plugin like the cron in sweep.ts.
// Everything it does is in receiveEmail (apps/api/src/index.ts) and src/inbound.ts.

import { receiveEmail } from "#api/index";

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook(
    "cloudflare:email",
    async (payload: { message?: unknown; env?: unknown; context?: unknown }) => {
      const env = payload?.env as Parameters<typeof receiveEmail>[1] | undefined;
      if (!env?.DB || !payload.message) return;
      await receiveEmail(
        payload.message as Parameters<typeof receiveEmail>[0],
        env,
        payload.context as ExecutionContext | undefined,
      );
    },
  );
});
