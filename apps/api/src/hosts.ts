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
const APEX = "https://passalong.dev";

const bare = (host: string | undefined) => (host ?? "").split(":")[0];

/**
 * Where this request belongs instead, or null to serve it here.
 *
 * Both the Host header and the URL are consulted because neither is present everywhere: Cloudflare
 * delivers a Host header, a synthetic `Request` carries the name only in the URL, and `wrangler
 * dev` rewrites both to localhost — which is why this lives in its own module rather than inline
 * in a middleware no test could reach (`src/index.ts` imports siblings as `./x.js`, which Node's
 * type stripping cannot resolve, so the app itself is not importable from a test).
 */
export function canonicalRedirect(url: string, hostHeader?: string): string | null {
  const u = new URL(url);
  if (bare(hostHeader) !== WWW && bare(u.hostname) !== WWW) return null;
  return `${APEX}${u.pathname}${u.search}`;
}
