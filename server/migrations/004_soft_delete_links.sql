-- Removing a link is manual work, and R-9.10 says a re-import must never
-- destroy manual work. A hard DELETE cannot survive: the importer's INSERT
-- would simply re-create the row on the next run. So a user-removed link is
-- tombstoned instead, and the importer leaves a tombstoned row alone.
--
-- SQLite has no ADD COLUMN IF NOT EXISTS. Adding a nullable column is the
-- normal way to extend a table, and the migration runner applies this once.
ALTER TABLE pwc_feature_mvp_features ADD COLUMN removed_at TEXT;
ALTER TABLE pwc_feature_capabilities ADD COLUMN removed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_feature_mvp_live
  ON pwc_feature_mvp_features (pwc_feature_id) WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_feature_capabilities_live
  ON pwc_feature_capabilities (pwc_feature_id) WHERE removed_at IS NULL;
