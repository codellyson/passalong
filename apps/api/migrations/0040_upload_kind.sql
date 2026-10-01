-- What an upload link was minted for: a picture or a file.
--
-- The link is the whole authorisation for one upload (migration 0019), and "an image" was part of
-- what it authorised: the bytes were sniffed as a picture and refused otherwise. An agent that holds a
-- log or a PDF as a file has the same problem an agent holding a screenshot has — its sandbox can run
-- curl and cannot put bytes in a tool call — so the link now says which of the two it will take, and
-- the server checks the bytes against that and nothing else. Existing links are pictures.
ALTER TABLE upload ADD COLUMN kind TEXT NOT NULL DEFAULT 'image';
