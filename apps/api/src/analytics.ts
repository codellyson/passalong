// Product analytics, sent from the Worker rather than the browser.
//
// The browser was the wrong place for this. A share link is `/g/:id/:key` where the key *is* the
// secret, and every web analytics SDK reports the page URL — so the obvious integration would have
// posted users' share keys to a third party. Guide pages also run no script at all, and that CSP
// is what makes rendering someone else's markdown safe, so loosening it to measure page views
// would trade the product's one real security property for a chart.
//
// Sending from here means no third-party script, no CSP change, and total control over what
// leaves. The rule: **event names and categorical props only**. Never an id, handle, email, team
// name, guide title, or anything from a URL. If a prop could identify a person or a guide, it does
// not go.
//
// Aptabase's ingest is a plain POST, so there is no SDK to vendor. Match what the official SDK
// actually sends, not the wiki: the endpoint is /api/v0/event (singular) taking one object, and
// the /api/v0/events batch form in the wiki silently dropped everything. Nothing catches this for
// you — the ingest answers 200 to a bogus key, a malformed key, and no key at all — so the only
// proof an event landed is the dashboard.

export type AnalyticsEnv = {
  APTABASE_KEY?: string;
  ENVIRONMENT?: string;
};

export type Props = Record<string, string | number | boolean>;

/** An `A-EU-` key belongs to the EU region, anything else to the US. */
const host = (key: string) =>
  key.includes("-EU-") ? "https://eu.aptabase.com" : "https://us.aptabase.com";

/**
 * Aptabase groups events into sessions, and reads this field as a timestamp: the SDKs send epoch
 * seconds followed by random digits, and anything that parses as long ago is rejected with
 * "Session is too old."
 *
 * There is no user here to key a session to, and inventing a durable id would be exactly the
 * tracking this design avoids. So the session is the *hour*, in the shape the server expects:
 * epoch seconds at the top of the hour, zero-padded to the SDKs' width. Everyone active in the
 * same hour shares one session id, which is the point — it groups time, not people.
 */
const sessionId = () => `${Math.floor(Date.now() / 3600e3) * 3600}00000000`;

/**
 * Report one event. Never throws and never blocks: analytics must not be able to fail a request
 * or slow one down, so callers hand it to `waitUntil` and forget about it.
 */
export async function track(
  env: AnalyticsEnv,
  name: string,
  props: Props = {},
  fetchImpl = fetch,
): Promise<void> {
  if (!env.APTABASE_KEY) return; // unset in dev, and in anyone else's deployment
  try {
    const res = await fetchImpl(`${host(env.APTABASE_KEY)}/api/v0/event`, {
      method: "POST",
      headers: { "content-type": "application/json", "app-key": env.APTABASE_KEY },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        sessionId: sessionId(),
        eventName: name,
        systemProps: {
          // The same four the official web SDK sends, and no more.
          locale: "en-US",
          isDebug: env.ENVIRONMENT !== "production",
          appVersion: "1",
          sdkVersion: "passalong-worker@1",
        },
        props,
      }),
      signal: AbortSignal.timeout(3000),
    });
    // A rejected batch used to vanish here. Silence is the one failure mode analytics must not
    // have: you cannot tell "nothing happened" from "nothing was delivered".
    if (!res.ok) console.error("analytics rejected", name, res.status, await res.text());
  } catch (e) {
    console.error("analytics", name, (e as Error).message);
  }
}
