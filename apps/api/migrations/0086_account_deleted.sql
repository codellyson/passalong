-- An account deleted from the owner's admin hub (src/delete-account.ts).
--
-- The row stays, emptied of everything that says who it was: its email, name, handle, password and
-- settings are cleared and `deleted_at` says when. Work, thread lines, proof and document edits it
-- left in other people's teams still point at it, and every one of those references is a foreign
-- key — some with ON DELETE CASCADE, which would take other people's history with it, and some with
-- none, which would refuse the delete outright. Kept, they read as "Deleted account". Billing
-- columns stay too: what was paid for is a financial record, and nothing in them names a person.
ALTER TABLE account ADD COLUMN deleted_at TEXT NOT NULL DEFAULT '';
