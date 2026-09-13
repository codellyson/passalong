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
    // The browser-facing half has a plain path because a person sees it in an address bar; the
    // machine-facing half lives under /v1/ with the rest of the API. Advertising anything other
    // than where the routes actually are is a 404 a client cannot diagnose.
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/v1/oauth/token`,
    // Both, because a connector may be configured either way and the secret is optional here.
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    response_types_supported: ["code"],
    // S256 only. `plain` is in the spec and is not worth supporting: it protects nothing.
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [MCP_SCOPE],
    revocation_endpoint: `${origin}/v1/oauth/revoke`,
    // RFC 7591. What lets someone connect by pasting one address: the client reads this document,
    // registers itself, and sends the person to approve — no connector form, no copied client id.
    // Under /v1/ with the token endpoint, because it is the machine-facing half too.
    registration_endpoint: `${origin}/v1/oauth/register`,
    service_documentation: `${origin}/connect`,
  };
}

// ---- dynamic client registration ----------------------------------------------------------------

/** A registration nobody approved is forgotten after this long. See oauth-clients.ts. */
export const DYNAMIC_TTL_MS = 24 * 3600_000;
export const MAX_REDIRECT_URIS = 5;
export const MAX_URI_LENGTH = 2000;
export const MAX_CLIENT_NAME = 60;

/** What a client registered itself as, after every rule below has been applied. */
export interface Registration {
  client_name: string;
  redirect_uris: string[];
  client_uri: string;
}

export type RegistrationResult =
  | { ok: true; registration: Registration }
  | {
      ok: false;
      error: "invalid_redirect_uri" | "invalid_client_metadata";
      error_description: string;
    };

/**
 * A loopback host, per RFC 8252 §7.3 and §8.3.
 *
 * `localhost` is included because the brief for this server names it, and because a native client
 * on the person's own machine is exactly who uses it — though the RFC prefers the IP literals,
 * since `localhost` can be resolved to something else by a hostile resolver.
 */
export function isLoopback(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "localhost";
}

/**
 * Why a redirect URI cannot be registered, or null when it can.
 *
 * - https, or http only for loopback (RFC 8252 §7.3): a code sent over plain http to anything
 *   else is readable by everyone on the path.
 * - No fragment (RFC 6749 §3.1.2): the code is appended to the query, and a fragment makes where
 *   it lands ambiguous.
 * - No wildcards: a `*` is not a URL character a client needs, and matching one is how an
 *   authorization server turns into an open redirector. Redirects are exact-matched in any case.
 * - No userinfo: `https://claude.ai@evil.test/` reads as claude.ai to a person and goes to evil.test.
 * - Bounded length, so the column cannot be used as storage.
 */
export function redirectUriProblem(uri: unknown): string | null {
  if (typeof uri !== "string" || !uri) return "a redirect URI must be a non-empty string";
  if (uri.length > MAX_URI_LENGTH)
    return `a redirect URI must be under ${MAX_URI_LENGTH} characters`;
  if (uri.includes("*")) return "wildcards are not allowed in redirect URIs";
  if (uri.includes("#")) return "a redirect URI must not contain a fragment";
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return "a redirect URI must be an absolute URL";
  }
  if (url.username || url.password) return "a redirect URI must not contain credentials";
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && isLoopback(url.hostname)) return null;
  return "redirect URIs must use https, or http only for 127.0.0.1, [::1] or localhost";
}

/**
 * A name as a person will read it on the consent screen.
 *
 * Control characters and bidirectional overrides are removed — the second because a name can use
 * them to display as something it does not contain. Capped, because a name is a label. The
 * consent screen shows the redirect host beside it regardless, so a registration calling itself
 * "Passalong" still says where it is going to send you.
 */
export function cleanClientName(name: unknown): string {
  if (typeof name !== "string") return "";
  return (
    name
      // Whitespace first, so a newline becomes a space rather than gluing two words together.
      .replace(/\s+/g, " ")
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
      .trim()
      .slice(0, MAX_CLIENT_NAME)
  );
}

/** The host a redirect goes to, as the consent screen and the connectors list show it. */
export function redirectHost(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return "";
  }
}

const GRANT_TYPES = new Set(["authorization_code", "refresh_token"]);

/**
 * RFC 7591 §2, applied.
 *
 * Only what this server can honour is accepted. Where the RFC lets the server substitute its own
 * value (§3.2.1) it does, rather than refusing: `token_endpoint_auth_method` is always `none` and
 * `scope` is always `mcp`, because a registration nobody has approved must not be able to ask for
 * a secret or a wider scope, and a client asking for either still works as a public client with
 * PKCE. Grant and response types a client cannot use are refused, since substituting would promise
 * a flow it did not ask for.
 */
export function validateRegistration(body: unknown): RegistrationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return bad("invalid_client_metadata", "the registration must be a JSON object");
  }
  const b = body as Record<string, unknown>;

  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0) {
    return bad("invalid_redirect_uri", "redirect_uris is required and must list at least one URI");
  }
  if (uris.length > MAX_REDIRECT_URIS) {
    return bad(
      "invalid_redirect_uri",
      `at most ${MAX_REDIRECT_URIS} redirect URIs may be registered`,
    );
  }
  for (const uri of uris) {
    const problem = redirectUriProblem(uri);
    if (problem) return bad("invalid_redirect_uri", problem);
  }

  if (b.grant_types !== undefined) {
    if (!Array.isArray(b.grant_types) || !b.grant_types.every((g) => GRANT_TYPES.has(String(g)))) {
      return bad(
        "invalid_client_metadata",
        "grant_types may only include authorization_code and refresh_token",
      );
    }
  }
  if (b.response_types !== undefined) {
    if (!Array.isArray(b.response_types) || !b.response_types.every((r) => r === "code")) {
      return bad("invalid_client_metadata", 'response_types may only include "code"');
    }
  }

  // Kept only when it is an https URL of sane length; it is metadata, never followed or rendered.
  const clientUri =
    typeof b.client_uri === "string" &&
    b.client_uri.length <= MAX_URI_LENGTH &&
    /^https:\/\/[^\s]+$/.test(b.client_uri)
      ? b.client_uri
      : "";

  return {
    ok: true,
    registration: {
      client_name: cleanClientName(b.client_name),
      redirect_uris: [...new Set(uris as string[])],
      client_uri: clientUri,
    },
  };
}

function bad(
  error: "invalid_redirect_uri" | "invalid_client_metadata",
  error_description: string,
): RegistrationResult {
  return { ok: false, error, error_description };
}

/** The RFC 7591 §3.2.1 response for a client this server has just registered. */
export function registrationResponse(
  id: string,
  issuedAt: Date,
  registration: Registration,
): Record<string, unknown> {
  return {
    client_id: id,
    client_id_issued_at: Math.floor(issuedAt.getTime() / 1000),
    // No secret, so it never expires on that account; the registration itself lapses if nobody
    // approves it (DYNAMIC_TTL_MS).
    client_secret_expires_at: 0,
    client_name: registration.client_name || undefined,
    client_uri: registration.client_uri || undefined,
    redirect_uris: registration.redirect_uris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: MCP_SCOPE,
  };
}

/**
 * The redirect to use for a client with one or more registered addresses, or null to refuse.
 *
 * Exact match against any registered URI. Omitting it is only allowed when there is exactly one to
 * fall back to (RFC 6749 §3.1.2.3). The one relaxation is RFC 8252 §7.3: for a loopback redirect
 * the port is chosen by the native app at runtime, so it is ignored — scheme, host and path must
 * still match.
 */
export function pickRedirect(registered: string[], asked: string | undefined): string | null {
  if (!asked) return registered.length === 1 ? (registered[0] as string) : null;
  for (const uri of registered) {
    if (timingSafeEqual(uri, asked)) return asked;
  }
  let a: URL;
  try {
    a = new URL(asked);
  } catch {
    return null;
  }
  if (a.protocol !== "http:" || !isLoopback(a.hostname)) return null;
  for (const uri of registered) {
    try {
      const r = new URL(uri);
      if (
        r.protocol === "http:" &&
        r.hostname === a.hostname &&
        r.pathname === a.pathname &&
        r.search === a.search
      ) {
        return asked;
      }
    } catch {}
  }
  return null;
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
