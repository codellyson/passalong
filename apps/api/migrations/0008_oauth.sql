-- M8: OAuth, so a hosted assistant can hold a credential of its own.
--
-- Everything else that authenticates here is a bearer token a person minted and pasted. That works
-- for a CLI on your own machine and not for a connector in somebody's ChatGPT: pasting a token
-- that reaches your whole account into a third party is the thing OAuth exists to stop people
-- doing. So a connector gets its own grant — issued by you, scoped, expiring, revocable on its own
-- without touching the tokens your CLI uses.
--
-- Deliberately small. This is an authorization server for connectors to this API, not an identity
-- provider: no openid, no userinfo, no implicit grant. Authorization code with PKCE, and refresh.

-- A registered client. ChatGPT calls this a "User-Defined OAuth Client": you create one here and
-- paste its id into the connector's form.
--
-- `secret_hash` is empty for a public client — the case the connector's own "token endpoint auth
-- method: none" describes, where PKCE is what proves the redemption is genuine rather than a
-- shared secret sitting in someone else's configuration.
CREATE TABLE oauth_client (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT '',
  secret_hash  TEXT NOT NULL DEFAULT '',
  redirect_uri TEXT NOT NULL,
  created      TEXT NOT NULL,
  revoked      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX oauth_client_account ON oauth_client(account_id, created DESC);

-- An authorization code, in the seconds between someone approving and the client redeeming.
--
-- Single use and short lived: `redeemed` is set the moment it is exchanged, so replaying one gets
-- nothing. `challenge` is the PKCE code_challenge; the redemption must present a verifier that
-- hashes to it, which is what stops an intercepted code being useful to whoever intercepted it.
CREATE TABLE oauth_code (
  code       TEXT PRIMARY KEY,          -- SHA-256, like every other credential here
  client_id  TEXT NOT NULL REFERENCES oauth_client(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  challenge  TEXT NOT NULL,
  method     TEXT NOT NULL DEFAULT 'S256',
  redirect_uri TEXT NOT NULL,
  scope      TEXT NOT NULL DEFAULT 'mcp',
  expires    TEXT NOT NULL,
  redeemed   TEXT NOT NULL DEFAULT '',
  created    TEXT NOT NULL
);

-- What the client actually holds. Access tokens expire in an hour; the refresh token is how it
-- gets another without asking you again, and rotates each time so a stolen one is useful once at
-- most before the legitimate client's next refresh invalidates it.
--
-- `scope` is the point of the whole table: `mcp` reaches the MCP endpoint and nothing else, so a
-- connector cannot quietly become full account access the way a pasted API token would.
CREATE TABLE oauth_token (
  access_hash  TEXT PRIMARY KEY,
  refresh_hash TEXT NOT NULL DEFAULT '',
  client_id    TEXT NOT NULL REFERENCES oauth_client(id) ON DELETE CASCADE,
  account_id   TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  scope        TEXT NOT NULL DEFAULT 'mcp',
  expires      TEXT NOT NULL,
  created      TEXT NOT NULL,
  last_used    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX oauth_token_refresh ON oauth_token(refresh_hash) WHERE refresh_hash <> '';
CREATE INDEX oauth_token_account ON oauth_token(account_id, created DESC);
