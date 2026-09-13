/**
 * OAuth clients in the database: the ones a person created, and the ones that registered themselves.
 *
 * Imports nothing, like oauth.ts, and for the same reason: this is where "a registration grants
 * nothing until a person approves it" and "disconnecting kills the tokens" are actually decided,
 * so it has to be testable — test/oauth-clients.test.mjs runs it against real SQLite with the real
 * migrations. The caller supplies ids and timestamps.
 */

/** A client as the authorize, approve and consent routes need it, approved or not. */
export interface ClientView {
  id: string;
  name: string;
  redirect_uris: string[];
  secret_hash: string;
  registered: "manual" | "dynamic";
  /** False for a self-registration nobody has approved yet: it lives in oauth_registration. */
  approved: boolean;
}

interface ClientRow {
  id: string;
  account_id: string;
  name: string;
  secret_hash: string;
  redirect_uri: string;
  redirect_uris: string;
  registered: string;
}

interface RegistrationRow {
  id: string;
  name: string;
  redirect_uris: string;
  client_uri: string;
  created: string;
}

const parseUris = (raw: string, fallback: string): string[] => {
  try {
    const list = JSON.parse(raw);
    if (Array.isArray(list) && list.length) return list.map(String);
  } catch {}
  return fallback ? [fallback] : [];
};

/** The oldest `created` a pending registration may have and still be usable. */
export const registrationCutoff = (now: Date, ttlMs: number) =>
  new Date(now.getTime() - ttlMs).toISOString();

/**
 * Look a client up by id for the browser half of the flow.
 *
 * Revoked clients are not found. Pending registrations are found only while they are younger than
 * the cutoff — an expired one is refused even if the sweep has not reached it yet.
 */
export async function findClient(
  db: D1Database,
  id: string,
  cutoff: string,
): Promise<ClientView | null> {
  if (!id) return null;
  const client = await db
    .prepare("SELECT * FROM oauth_client WHERE id = ? AND revoked = ''")
    .bind(id)
    .first<ClientRow>();
  if (client) {
    return {
      id: client.id,
      name: client.name,
      redirect_uris: parseUris(client.redirect_uris, client.redirect_uri),
      secret_hash: client.secret_hash,
      registered: client.registered === "dynamic" ? "dynamic" : "manual",
      approved: true,
    };
  }
  const pending = await db
    .prepare("SELECT * FROM oauth_registration WHERE id = ? AND created > ?")
    .bind(id, cutoff)
    .first<RegistrationRow>();
  if (!pending) return null;
  return {
    id: pending.id,
    name: pending.name,
    redirect_uris: parseUris(pending.redirect_uris, ""),
    secret_hash: "",
    registered: "dynamic",
    approved: false,
  };
}

/**
 * The client the token endpoint may issue to, or null.
 *
 * Reads `oauth_client` only. A self-registration nobody approved is in `oauth_registration`, so it
 * is not found here and gets `invalid_client` — whatever it presents, it cannot get a token.
 */
export async function tokenClient(db: D1Database, id: string) {
  if (!id) return null;
  return db
    .prepare("SELECT id, secret_hash FROM oauth_client WHERE id = ? AND revoked = ''")
    .bind(id)
    .first<{ id: string; secret_hash: string }>();
}

/** Store a registration. Nothing it holds is a credential; it waits for a person to approve it. */
export async function saveRegistration(
  db: D1Database,
  id: string,
  registration: { client_name: string; redirect_uris: string[]; client_uri: string },
  created: string,
) {
  await db
    .prepare(
      `INSERT INTO oauth_registration (id, name, redirect_uris, client_uri, created)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      registration.client_name,
      JSON.stringify(registration.redirect_uris),
      registration.client_uri,
      created,
    )
    .run();
}

/**
 * A person approved this client. Record that, and make a pending registration a real client.
 *
 * The first approval moves the registration into `oauth_client`, owned by the approving account,
 * in one batch (D1 runs a batch as a transaction). `INSERT OR IGNORE` because two approvals can
 * race; the first owner wins and both get a consent row. Every approval — manual clients too —
 * records consent, which is what the connectors list reads "approved" from.
 *
 * Called only from the approve route, which requires the session cookie: this is the step that
 * lets a client get a token at all, so no bearer token may reach it.
 */
export async function recordApproval(
  db: D1Database,
  client: ClientView,
  account: string,
  at: string,
) {
  const statements: D1PreparedStatement[] = [];
  if (!client.approved) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO oauth_client
             (id, account_id, name, secret_hash, redirect_uri, redirect_uris, created, registered)
           VALUES (?, ?, ?, '', ?, ?, ?, 'dynamic')`,
        )
        .bind(
          client.id,
          account,
          client.name,
          client.redirect_uris[0] ?? "",
          JSON.stringify(client.redirect_uris),
          at,
        ),
      db.prepare("DELETE FROM oauth_registration WHERE id = ?").bind(client.id),
    );
  }
  statements.push(
    db
      .prepare(
        "INSERT OR IGNORE INTO oauth_consent (client_id, account_id, created) VALUES (?, ?, ?)",
      )
      .bind(client.id, account, at),
  );
  await db.batch(statements);
}

/** One row of Settings → Connectors. */
export interface Connector {
  id: string;
  name: string;
  redirect_uri: string;
  registered: "manual" | "dynamic";
  created: string;
  approved: string | null;
  last_used: string | null;
  confidential: number;
  grants: number;
}

/**
 * The connectors an account can see and disconnect.
 *
 * Manual clients: the ones this account created, as before, with every grant counted. Dynamic
 * clients: the ones this account approved, with only this account's grants — someone else's
 * approval of the same client is theirs to see. `last_used` falls back to a token's `created`,
 * because refresh replaces the row and a refresh is a use.
 */
export async function listConnectors(db: D1Database, account: string): Promise<Connector[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.name, c.redirect_uri, c.registered, c.created,
              -- A connector someone created by hand was approved the moment they created it; only
              -- a self-registered app waits for a consent row. Reading consent alone printed "not
              -- yet" beside manual connectors that were in use.
              COALESCE(k.created, CASE WHEN c.registered = 'manual' THEN c.created END) AS approved,
              c.secret_hash <> '' AS confidential,
              (SELECT COUNT(*) FROM oauth_token t
                WHERE t.client_id = c.id AND (c.registered = 'manual' OR t.account_id = ?1)) AS grants,
              (SELECT MAX(CASE WHEN t.last_used <> '' THEN t.last_used ELSE t.created END)
                 FROM oauth_token t
                WHERE t.client_id = c.id AND (c.registered = 'manual' OR t.account_id = ?1)) AS last_used
       FROM oauth_client c
       LEFT JOIN oauth_consent k ON k.client_id = c.id AND k.account_id = ?1
       WHERE c.revoked = ''
         AND ((c.registered = 'manual' AND c.account_id = ?1)
           OR (c.registered = 'dynamic' AND k.account_id IS NOT NULL))
       ORDER BY COALESCE(k.created, c.created) DESC`,
    )
    .bind(account)
    .all<Connector>();
  return results;
}

/**
 * Disconnect a client from an account. Returns false when the account cannot see it.
 *
 * Either way its tokens and unredeemed codes stop working now, not when an access token happens
 * to expire — `grantFor` finds nothing to authenticate.
 *
 * - Manual: only its creator may remove it, and it is revoked outright, as it always was.
 * - Dynamic: this account's tokens, codes and consent go; the client itself stays, because
 *   someone else may have approved it too, and because the assistant still holds its id — so
 *   reconnecting later is approving again, not a registration that silently fails. Nothing is
 *   granted by it staying: every future token still needs a person to approve.
 */
export async function disconnect(
  db: D1Database,
  id: string,
  account: string,
  at: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT c.registered, c.account_id,
              EXISTS (SELECT 1 FROM oauth_consent k WHERE k.client_id = c.id AND k.account_id = ?) AS consented
       FROM oauth_client c WHERE c.id = ? AND c.revoked = ''`,
    )
    .bind(account, id)
    .first<{ registered: string; account_id: string; consented: number }>();
  if (!row) return false;

  if (row.registered === "dynamic") {
    if (!row.consented) return false;
    await db.batch([
      db
        .prepare("DELETE FROM oauth_token WHERE client_id = ? AND account_id = ?")
        .bind(id, account),
      db.prepare("DELETE FROM oauth_code WHERE client_id = ? AND account_id = ?").bind(id, account),
      db
        .prepare("DELETE FROM oauth_consent WHERE client_id = ? AND account_id = ?")
        .bind(id, account),
    ]);
    return true;
  }

  if (row.account_id !== account) return false;
  await db.batch([
    db.prepare("UPDATE oauth_client SET revoked = ? WHERE id = ?").bind(at, id),
    db.prepare("DELETE FROM oauth_token WHERE client_id = ?").bind(id),
    db.prepare("DELETE FROM oauth_code WHERE client_id = ?").bind(id),
    db.prepare("DELETE FROM oauth_consent WHERE client_id = ?").bind(id),
  ]);
  return true;
}

/**
 * Forget registrations nobody approved within the TTL.
 *
 * Run lazily on every registration, so the table cannot grow without bound between cron ticks,
 * and from the nightly sweep. Approved clients are never touched: they are in `oauth_client`.
 */
export async function sweepRegistrations(db: D1Database, cutoff: string): Promise<number> {
  const result = await db
    .prepare("DELETE FROM oauth_registration WHERE created <= ?")
    .bind(cutoff)
    .run();
  return result.meta?.changes ?? 0;
}
