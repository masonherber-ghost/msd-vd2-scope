-- Assumptions become one markdown field per feature.
--
-- The ordered-list table (002) needed move-up/move-down, per-row edit and
-- delete controls, which was more machinery than the content warranted. A
-- feature now carries a single `notes` markdown field holding its assumptions
-- and any other notes, edited as one block of text.
--
-- `notes_edited` records that someone has edited the notes in the app. Import
-- writes the source assumptions into `notes` only while it is 0, so a
-- re-import never overwrites an edit (R-11.4). It is separate from `source`
-- because editing the notes should not freeze the feature's other fields
-- against re-import — editing an assumption never did.
--
-- SQLite has no ADD COLUMN IF NOT EXISTS; the runner applies this once.
ALTER TABLE pwc_features ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE pwc_features ADD COLUMN notes_edited INTEGER NOT NULL DEFAULT 0;

-- Backfill as a numbered markdown list, in the existing order.
UPDATE pwc_features
   SET notes = IFNULL((
         SELECT group_concat(a.position || '. ' || a.text, char(10) ORDER BY a.position)
           FROM assumptions a
          WHERE a.pwc_feature_id = pwc_features.id
       ), '');

-- A manually added or edited assumption was an edit; keep it safe from import.
UPDATE pwc_features
   SET notes_edited = 1
 WHERE EXISTS (
         SELECT 1 FROM assumptions a
          WHERE a.pwc_feature_id = pwc_features.id AND a.source = 'manual'
       );

DROP INDEX IF EXISTS idx_assumptions_feature;
DROP TABLE IF EXISTS assumptions;
