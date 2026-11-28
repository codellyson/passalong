// Ad measurement through Meta's Conversions API, sent from the Worker rather than the browser.
//
// Same reasoning as analytics.ts: a browser pixel would mean a third-party script on every page,
// a CSP widened on the pages that render other people's markdown, and share keys in reported URLs.
// So there is no pixel. The Worker tells Meta about three moments and nothing else: an account
// was made, a checkout was started, a plan started being paid for.
//
// Unlike analytics.ts, this does carry personal data, because Meta cannot match an event to an ad
// without it: the email address, SHA-256 hashed as Meta requires, and on events a person caused
// directly, their IP address and user agent. That is the whole list. Never a handle, a team, a
// work title, or any URL but the fixed page the event belongs to. The privacy page says so.
//
// Without META_PIXEL_ID and META_CAPI_TOKEN nothing is sent, which is every deployment but
// production.

export type MetaEnv = {
  META_PIXEL_ID?: string;
  META_CAPI_TOKEN?: string;
  /** Events Manager's "Test events" code. Set it briefly to watch events arrive, then remove it. */
  META_TEST_CODE?: string;
};

export type MetaEvent = {
  name: "CompleteRegistration" | "InitiateCheckout" | "Subscribe";
  email?: string;
  /** Only for something a person did in their browser just now. A webhook has neither. */
  ip?: string;
  ua?: string;
  /** A fixed page such as `${origin}/hub`, never a URL carrying an id or a key. */
  url?: string;
  /** Lets Meta drop a duplicate if the same event is ever sent twice. */
  id?: string;
};

const GRAPH = "https://graph.facebook.com/v26.0";

const hash = async (s: string) => {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s.trim().toLowerCase()),
  );
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/** Report one event. Never throws and never blocks: callers hand it to `waitUntil`. */
export async function metaEvent(env: MetaEnv, e: MetaEvent, fetchImpl = fetch): Promise<void> {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) return;
  const user_data: Record<string, unknown> = {};
  if (e.email) user_data.em = [await hash(e.email)];
  if (e.ip) user_data.client_ip_address = e.ip;
  if (e.ua) user_data.client_user_agent = e.ua;
  if (!Object.keys(user_data).length) return; // Meta refuses an event it cannot match to anyone
  try {
    const res = await fetchImpl(`${GRAPH}/${env.META_PIXEL_ID}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: [
          {
            event_name: e.name,
            event_time: Math.floor(Date.now() / 1000),
            ...(e.id ? { event_id: e.id } : {}),
            // "website" requires the browser's IP and user agent; a webhook has neither.
            action_source: e.ip && e.ua ? "website" : "system_generated",
            ...(e.url ? { event_source_url: e.url } : {}),
            user_data,
          },
        ],
        ...(env.META_TEST_CODE ? { test_event_code: env.META_TEST_CODE } : {}),
        // In the body, not the query string, so it never lands in a request log.
        access_token: env.META_CAPI_TOKEN,
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) console.error("meta rejected", e.name, res.status, await res.text());
  } catch (err) {
    console.error("meta", e.name, (err as Error).message);
  }
}
