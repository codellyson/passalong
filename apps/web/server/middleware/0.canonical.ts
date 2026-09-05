// `www.passalong.dev` is routed so the name resolves, but it does not serve: two hosts minting
// share links for the same guide would split one link into two, and a key in the URL makes that
// worse than untidy. The old kreativekorna host is deliberately *not* redirected — links under it
// are already in circulation, so it keeps serving.
//
// This was Hono's first middleware. It has to move out here rather than ride along with the
// mounted app below, because that mount only sees `/v1/*` and two machine routes — a page request
// to www would never reach it.
import { canonicalRedirect } from "#api/hosts";

export default defineEventHandler((event) => {
  const to = canonicalRedirect(getRequestURL(event).toString(), getRequestHeader(event, "host"));
  // 308 rather than 301: the method and body survive, so a POST to www is not silently turned
  // into a GET.
  if (to) return sendRedirect(event, to, 308);
});
