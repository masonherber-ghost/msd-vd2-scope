-- A capability's identity is (mvp_ref, LOWER(text)), which is right for the
-- documents: the same wording under the same ref is the same capability.
--
-- It stops being right the moment someone corrects the wording by hand. The
-- import still carries the document's original text, which no longer matches
-- any row, so it inserts a second capability and the renamed one is orphaned
-- beside it — 107 rows became 108 on the next import.
--
-- source_text records what the document said, so a renamed row can still be
-- recognised as the one that text belongs to. It stays NULL for a capability
-- created by hand: no document ever named it, so no import should claim it.
--
-- SQLite has no ADD COLUMN IF NOT EXISTS. Adding a nullable column is the
-- normal way to extend a table, and the migration runner applies this once.
ALTER TABLE capabilities ADD COLUMN source_text TEXT;

-- Everything already imported was named by a document, and nothing has been
-- renamed yet at the point this runs, so the current text is that wording.
UPDATE capabilities SET source_text = text WHERE source_text IS NULL AND source != 'manual';

CREATE INDEX IF NOT EXISTS idx_capabilities_source_text
  ON capabilities (mvp_ref, LOWER(source_text));
