// Which hosts serve, and which only point at one.
//
// `passalong.dev` is canonical. `www.passalong.dev` is routed so the name resolves, but serving it
// would mint a second share link for every guide — and a share key lives in the URL, so one link
// becoming two is a real problem rather than an untidy one. `passalong.kreativekorna.com` does
// serve: links under it were handed out before the move and have to keep resolving. It no longer
// *mints* anything, though — `PUBLIC_ORIGIN` names the apex, so a guide shared from either host
// gets one link and it is the canonical one. Serving an old link and creating a new one under the
// same name are different jobs, and only the first is worth keeping.
const WWW = "www.passalong.dev";
/** The one origin search engines should know. Public pages name it as their canonical URL. */
export const APEX = "https://passalong.dev";

/** Hosts that serve pages to the public, and so must never answer over plain http. */
const SERVING = new Set(["passalong.dev", "passalong.kreativekorna.com"]);

const bare = (host: string | undefined) => (host ?? "").split(":")[0] ?? "";

/**
 * Where this request belongs instead, or null to serve it here.
 *
 * Both the Host header and the URL are consulted because neither is present everywhere: Cloudflare
 * delivers a Host header, a synthetic `Request` carries the name only in the URL, and `wrangler
 * dev` rewrites both to localhost — which is why this lives in its own module rather than inline
 * in a middleware no test could reach (`src/index.ts` imports siblings as `./x.js`, which Node's
 * type stripping cannot resolve, so the app itself is not importable from a test).
 *
 * `proto` is the scheme the visitor actually used, as the edge reports it (`x-forwarded-proto`).
 * It is taken from the header and never from the URL: behind the edge the URL's scheme is whatever
 * the runtime reconstructed, and trusting a wrong `http:` there would redirect every request to
 * itself forever. No header, no upgrade.
 */
export function canonicalRedirect(url: string, hostHeader?: string, proto?: string): string | null {
  const u = new URL(url);
  if (bare(hostHeader) === WWW || bare(u.hostname) === WWW)
    return `${APEX}${u.pathname}${u.search}`;
  // Plain http on a serving host is a second copy of every page to a crawler, and a share key sent
  // in the clear to everyone else. Same host, so a legacy link stays on the legacy host.
  const host = bare(hostHeader) || bare(u.hostname);
  if (proto === "http" && SERVING.has(host)) return `https://${host}${u.pathname}${u.search}`;
  return null;
}
