/**
 * OAuth, for connectors.
 *
 * Everything else here authenticates with a bearer token a person minted and pasted. That is right
 * for a CLI on your own machine and wrong for a connector living in somebody's hosted assistant:
 * pasting a credential that reaches your whole account into a third party is exactly what OAuth
 * exists to stop people doing. A connector gets a grant of its own instead — issued by you,
 * scoped to the MCP endpoint, expiring, and revocable without touching the tokens your CLI uses.
 *
 * Authorization code with PKCE, and refresh. No implicit grant, no openid, no userinfo: this is an
 * authorization server for connectors to this API, not an identity provider, and every endpoint it
 * does not have is one nobody can get wrong.
 *
 * Split in two on purpose: this half imports nothing. A sibling imported as `./auth.js` makes a
 * module unloadable under Node's type stripping — the reason the app itself has no tests — and the
 * pieces here are exactly the ones where being wrong is a security bug rather than a bug, so they
 * are the pieces that must be testable. The half that touches the database is in oauth-store.ts.
 *
 * Public clients are first class. The connector's own "token endpoint auth method: none" is that
 * case — no secret, PKCE proving the redemption came from whoever started the flow — and it is the
 * better default: a secret pasted into someone else's configuration is a secret you have lent out.
 */
/** The one scope. Reaches the MCP endpoint and nothing else. */
export const MCP_SCOPE = "mcp";

export interface OAuthClientRow {
  id: string;
  account_id: string;
  name: string;
  secret_hash: string;
  redirect_uri: string;
  revoked: string;
}

/**
 * What a client is told about this server.
 *
 * Published at `/.well-known/oauth-authorization-server`, which is where a connector looks when it
 * offers to "review discovered settings" — without it, a client can only be configured by hand and
 * says so by greying out every registration method that depends on discovery.
 */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    // Both, because a connector may be configured either way and the secret is optional here.
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    response_types_supported: ["code"],
    // S256 only. `plain` is in the spec and is not worth supporting: it protects nothing.
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [MCP_SCOPE],
    revocation_endpoint: `${origin}/oauth/revoke`,
    service_documentation: `${origin}/connect`,
  };
}

/**
 * What the MCP endpoint is, and who vouches for it.
 *
 * RFC 9728. A client that gets a 401 from the resource reads the `WWW-Authenticate` header, finds
 * this document, and learns which authorization server to go to — which is what makes the endpoint
 * self-describing rather than something you have to be told about out of band.
 */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/v1/mcp`,
    authorization_servers: [origin],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/connect`,
  };
}

/** The challenge in an authorization request, verified at redemption. S256 only. */
export async function pkceMatches(verifier: string, challenge: string): Promise<boolean> {
  if (!verifier || !challenge) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  // base64url, unpadded — the encoding the spec names, and the one a client will have produced.
  const encoded = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return timingSafeEqual(encoded, challenge);
}

/** Compare without leaking where two secrets diverge. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * A redirect_uri is only acceptable if it is the one registered, exactly.
 *
 * No prefix matching and no wildcards: those are how an open redirector becomes a way to walk off
 * with an authorization code. A client that needs a second address registers a second client.
 */
export function redirectAllowed(registered: string, asked: string | undefined): boolean {
  if (!asked) return true;
  return timingSafeEqual(registered, asked);
}

/** Where to send a client back when the request itself is refusable. */
export function errorRedirect(
  redirectUri: string,
  state: string | undefined,
  error: string,
  description: string,
) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}
