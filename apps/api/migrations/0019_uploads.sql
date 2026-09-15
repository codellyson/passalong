-- M19: upload links, so an agent holding an image as a file can hand it over without the bytes
-- passing through the model.
--
-- A remote MCP tool takes JSON, and only ChatGPT fills a tool input with a URL to fetch a file
-- from. Claude has the file in its own sandbox, where the server cannot reach it. So the tool mints
-- a link instead, and the sandbox sends the bytes to it with curl.
--
-- The link is a bearer credential for one upload, so it is stored as a hash like every other
-- secret, expires in minutes, and is spent by the first upload that uses it.
CREATE TABLE upload (
  hash       TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  created    TEXT NOT NULL,
  expires    TEXT NOT NULL,
  used       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX upload_account_expires ON upload(account_id, expires);
