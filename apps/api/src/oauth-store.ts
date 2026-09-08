/**
 * The OAuth grants, in the database.
 *
 * Split from oauth.ts so that file imports nothing and can therefore be tested: PKCE, the redirect
 * check and the comparisons live there. What is here is SQL and credential minting — every secret
 * stored as a SHA-256, like the tokens and sessions beside it, so a copy of this database is not a
 * set of working credentials.
 */
import { rand, sha256 } from "./auth.js";

const CODE_TTL_MS = 60_000;
const ACCESS_TTL_MS = 3600_000;
const now = () => new Date().toISOString();

export interface Issued {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}

/**
 * Mint a pair and store only their hashes, like every other credential in this product.
 *
 * The refresh token rotates on every use: the row is replaced rather than updated, so a refresh
 * token that has already been spent buys nothing even if someone else has a copy.
 */
export async function issueTokens(
  db: D1Database,
  grant: { client_id: string; account_id: string; scope: string },
  replacing?: string,
): Promise<Issued> {
  const access = `pa_at_${rand(40)}`;
  const refresh = `pa_rt_${rand(40)}`;
  const expires = new Date(Date.now() + ACCESS_TTL_MS).toISOString();
  const statements = [
    db
      .prepare(
        `INSERT INTO oauth_token (access_hash, refresh_hash, client_id, account_id, scope, expires, created)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        await sha256(access),
        await sha256(refresh),
        grant.client_id,
        grant.account_id,
        grant.scope,
        expires,
        now(),
      ),
  ];
  if (replacing) {
    statements.push(db.prepare("DELETE FROM oauth_token WHERE access_hash = ?").bind(replacing));
  }
  await db.batch(statements);
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    scope: grant.scope,
  };
}

/** An access token's grant, or null when it is unknown, expired, or its client is revoked. */
export async function grantFor(db: D1Database, token: string) {
  if (!token.startsWith("pa_at_")) return null;
  const row = await db
    .prepare(
      `SELECT t.access_hash, t.account_id, t.client_id, t.scope, t.expires
       FROM oauth_token t JOIN oauth_client c ON c.id = t.client_id
       WHERE t.access_hash = ? AND c.revoked = ''`,
    )
    .bind(await sha256(token))
    .first<{
      access_hash: string;
      account_id: string;
      client_id: string;
      scope: string;
      expires: string;
    }>();
  if (!row) return null;
  if (row.expires <= now()) return null;
  return row;
}

/** Store a code's hash; the plaintext goes to the client once and is never kept. */
export async function issueCode(
  db: D1Database,
  grant: {
    client_id: string;
    account_id: string;
    challenge: string;
    method: string;
    redirect_uri: string;
    scope: string;
  },
): Promise<string> {
  const code = rand(48);
  await db
    .prepare(
      `INSERT INTO oauth_code (code, client_id, account_id, challenge, method, redirect_uri, scope, expires, created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      await sha256(code),
      grant.client_id,
      grant.account_id,
      grant.challenge,
      grant.method,
      grant.redirect_uri,
      grant.scope,
      new Date(Date.now() + CODE_TTL_MS).toISOString(),
      now(),
    )
    .run();
  return code;
}

export const CODE_TTL_SECONDS = CODE_TTL_MS / 1000;
