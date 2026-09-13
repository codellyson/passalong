-- M18: clients that register themselves (RFC 7591), so connecting Claude or ChatGPT is pasting one
-- address and approving, not filling in a connector form.
--
-- A registration grants nothing. It is a name and some redirect URIs from someone nobody has
-- vouched for, and it stays in its own table until a signed-in person approves it on the consent
-- page. Only then does it become an `oauth_client` row — the only table the token endpoint reads —
-- owned by the account that approved it. That is what makes "an unapproved client cannot get a
-- token" a property of the schema rather than of a check someone might forget.
--
-- Its own table rather than a nullable `oauth_client.account_id`: making that column nullable
-- means rebuilding a table that `oauth_code` and `oauth_token` cascade from, and dropping it would
-- delete every connector's grants.
CREATE TABLE oauth_registration (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL DEFAULT '',
  redirect_uris TEXT NOT NULL,           -- JSON array, each one checked at registration
  client_uri    TEXT NOT NULL DEFAULT '',
  created       TEXT NOT NULL
);
-- Registrations nobody approved are deleted after 24 hours, by `created`.
CREATE INDEX oauth_registration_created ON oauth_registration(created);

-- 'manual' for a connector someone created in Settings, 'dynamic' for one that registered itself
-- and was then approved. They are revoked differently: see oauth-clients.ts.
ALTER TABLE oauth_client ADD COLUMN registered TEXT NOT NULL DEFAULT 'manual';
-- A dynamic client may register up to five addresses; `redirect_uri` keeps the first so every
-- existing reader of it is unchanged. Empty for manual clients, which have exactly one.
ALTER TABLE oauth_client ADD COLUMN redirect_uris TEXT NOT NULL DEFAULT '';

-- Who approved which client, and when. A dynamic client belongs to the person who first approved
-- it, but the same client (an organisation's connector, say) can be approved by others, and each
-- of them needs to see it in their own Settings and disconnect it without disconnecting anyone else.
CREATE TABLE oauth_consent (
  client_id  TEXT NOT NULL REFERENCES oauth_client(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  created    TEXT NOT NULL,
  PRIMARY KEY (client_id, account_id)
);
CREATE INDEX oauth_consent_account ON oauth_consent(account_id, created DESC);
