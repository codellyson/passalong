-- Work is private until someone shares it (2026-11-22). Until now every piece of work was given a
-- share key when it was made, and /w/:id/:key served it to anyone holding the link with no sign-in,
-- although nobody had chosen to make it public. Every key is revoked here: old links answer 404,
-- and a public link exists again only once its author picks Share (POST /v1/work/:id/share), with a
-- new key.
--
-- Each document's own `url:` line carried its share link; it is rewritten to the work's hub page,
-- which asks for sign-in, before the key it names is cleared. SET reads the row's old values, so
-- the replace sees the key that the same statement clears.
UPDATE work
   SET markdown = replace(markdown, '/w/' || id || '/' || share_key, '/hub/w/' || id),
       share_key = ''
 WHERE share_key <> '';
