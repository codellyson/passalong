#!/usr/bin/env node
// A VAPID key pair for Web Push (apps/api/src/webpush.ts), printed as the three settings the Worker
// reads. Run once per deployment and keep it: changing the key signs every device out of push.
//
//   node scripts/vapid-keys.mjs
//
// Production: `wrangler secret put VAPID_PRIVATE_KEY` in apps/web, and VAPID_PUBLIC_KEY and
// VAPID_SUBJECT as vars in apps/web/wrangler.jsonc. Local: paste all three into apps/web/.dev.vars.
import { vapidKeys } from "../apps/api/src/webpush.ts";

const { publicKey, privateKey } = await vapidKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("VAPID_SUBJECT=mailto:hello@passalong.dev");
