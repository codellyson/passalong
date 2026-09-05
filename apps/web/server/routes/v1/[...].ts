// Every `/v1/*` request the browser makes, forwarded to the API Worker.
//
// This exists because the port runs on a second origin: apps/web is on workers.dev while the API
// is on passalong.dev, and a browser calling across that boundary would need CORS on all thirty
// routes plus a `Domain` on the session cookie — real changes to production, to support a
// temporary arrangement. Proxying server-side means the browser only ever talks to one origin,
// so the client code in the pages is written once and does not change at cutover.
//
// At cutover this file is what gets replaced: the Hono app is imported and handed the request
// directly instead of it going over the wire. The pages do not notice.
export default defineEventHandler((event) => {
  const { apiOrigin } = useRuntimeConfig(event);
  return proxyRequest(event, new URL(event.path, apiOrigin).toString(), {
    // Hop-by-hop headers and the inbound host must not be forwarded: the API builds share links
    // from the host it sees, and a workers.dev host would mint links under the wrong name.
    headers: { host: new URL(apiOrigin).host },
  });
});
