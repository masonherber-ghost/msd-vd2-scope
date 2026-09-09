-- Scope map schema (PRD §6). Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS releases (
  id                   TEXT PRIMARY KEY,
  label                TEXT NOT NULL,
  name                 TEXT NOT NULL DEFAULT '',
  description          TEXT NOT NULL DEFAULT '',
  display_order        INTEGER NOT NULL,
  in_mapping_source    INTEGER NOT NULL DEFAULT 0,
  in_sequencing_source INTEGER NOT NULL DEFAULT 0,
  source               TEXT NOT NULL DEFAULT 'mapping'
                         CHECK (source IN ('mapping', 'sequencing', 'both', 'manual')),
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS phases (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  -- Free text and deliberately NOT unique: epic 186 appears on two phases
  -- (PRD §4, D-2). Rendered faithfully rather than corrected.
  epic_ref         TEXT NOT NULL,
  epic_description TEXT NOT NULL DEFAULT '',
  display_order    INTEGER NOT NULL,
  source           TEXT NOT NULL DEFAULT 'mapping'
                     CHECK (source IN ('mapping', 'sequencing', 'both', 'manual')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pwc_features (
  -- F-035. Sparse by design: F-004, F-012, F-015 and others are absent, and
  -- the gaps carry no meaning (PRD §6).
  id                 TEXT PRIMARY KEY CHECK (id GLOB 'F-[0-9][0-9][0-9]'),
  name               TEXT NOT NULL,
  foundational_build TEXT NOT NULL DEFAULT '',
  -- A feature with no release or phase has nowhere to draw on the map (R-9.3).
  release_id         TEXT NOT NULL REFERENCES releases (id),
  phase_id           TEXT NOT NULL REFERENCES phases (id),
  -- The label as written in the source, so the canonical phase merge stays
  -- auditable and reversible (PRD §4).
  source_phase_label TEXT,
  capability_note    TEXT,
  display_order      INTEGER NOT NULL,
  source             TEXT NOT NULL DEFAULT 'mapping'
                       CHECK (source IN ('mapping', 'sequencing', 'both', 'manual')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pwc_features_cell
  ON pwc_features (release_id, phase_id);

CREATE TABLE IF NOT EXISTS assumptions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  pwc_feature_id TEXT NOT NULL REFERENCES pwc_features (id) ON DELETE CASCADE,
  -- Contiguous 1..n per feature. Deliberately not a UNIQUE constraint: a
  -- move-up/move-down swap would need a temporary value to get past it.
  -- Contiguity is enforced in the repository and asserted in its tests.
  position       INTEGER NOT NULL,
  text           TEXT NOT NULL,
  source         TEXT NOT NULL DEFAULT 'mapping'
                   CHECK (source IN ('mapping', 'sequencing', 'both', 'manual')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assumptions_feature
  ON assumptions (pwc_feature_id, position);

CREATE TABLE IF NOT EXISTS mvp_features (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ref          INTEGER NOT NULL,
  -- Option 1A and 1B are separate feature records (PRD §6).
  scope_option TEXT CHECK (scope_option IN ('1A', '1B') OR scope_option IS NULL),
  title        TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'mapping'
                 CHECK (source IN ('mapping', 'sequencing', 'both', 'manual')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Uniqueness on (ref, scope_option) via IFNULL, NOT a plain UNIQUE: SQLite
-- treats NULLs as distinct in a unique index, so UNIQUE(ref, scope_option)
-- would happily accept two bare records for the same ref.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mvp_features_ref_option
  ON mvp_features (ref, IFNULL(scope_option, ''));

CREATE TABLE IF NOT EXISTS capabilities (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Resolved owner. Nullable because the ref may not resolve yet; mvp_ref is
  -- kept alongside so re-resolving is an UPDATE, never a migration (D-3).
  mvp_feature_id     INTEGER REFERENCES mvp_features (id),
  mvp_ref            INTEGER NOT NULL,
  -- 1 when the ref has more than one MVP record, so the owner was chosen by
  -- rule rather than stated by the source. Surfaced for review (D-3).
  mvp_owner_ambiguous INTEGER NOT NULL DEFAULT 0,
  text               TEXT NOT NULL,
  -- A new actor is a schema change, not free text (R-9.3).
  actor              TEXT NOT NULL
                       CHECK (actor IN ('employer', 'staff', 'jobseeker', 'system')),
  -- Nullable at this layer: an unmatched mapping-only capability genuinely has
  -- no placement. R-9.3 requires both for a user-edited capability, which the
  -- Zod validator enforces on the CRUD path.
  release_id         TEXT REFERENCES releases (id),
  phase_id           TEXT REFERENCES phases (id),
  source_phase_label TEXT,
  source             TEXT NOT NULL DEFAULT 'sequencing'
                       CHECK (source IN ('mapping', 'sequencing', 'both', 'manual')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Capability identity is (ref, case-insensitive text) — the rule that makes
-- "Filter and Sort Applications" and "Filter and sort applications" one row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_capabilities_identity
  ON capabilities (mvp_ref, LOWER(text));

CREATE INDEX IF NOT EXISTS idx_capabilities_cell
  ON capabilities (release_id, phase_id);

CREATE TABLE IF NOT EXISTS pwc_feature_mvp_features (
  pwc_feature_id TEXT NOT NULL REFERENCES pwc_features (id) ON DELETE CASCADE,
  mvp_feature_id INTEGER NOT NULL REFERENCES mvp_features (id) ON DELETE CASCADE,
  source         TEXT NOT NULL DEFAULT 'mapping'
                   CHECK (source IN ('mapping', 'sequencing', 'both', 'manual')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (pwc_feature_id, mvp_feature_id)
);

CREATE TABLE IF NOT EXISTS pwc_feature_capabilities (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  pwc_feature_id         TEXT NOT NULL REFERENCES pwc_features (id) ON DELETE CASCADE,
  capability_id          INTEGER NOT NULL REFERENCES capabilities (id) ON DELETE CASCADE,
  -- One edge per (feature, capability). F-079 cites both casings of ref 980,
  -- which are one capability — so 123 parsed citations become 122 edges and
  -- this column carries the 2. The sum still reconciles to 123.
  source_citations       INTEGER NOT NULL DEFAULT 1,
  -- 0 when the mapping file cites a capability the table has no exact match
  -- for. Never merged on a prefix (PRD §7).
  matched                INTEGER NOT NULL DEFAULT 1,
  -- A conflict is data, not an error: both placements are recorded and
  -- neither source is discarded (R-7.1).
  release_conflict       INTEGER NOT NULL DEFAULT 0,
  phase_conflict         INTEGER NOT NULL DEFAULT 0,
  feature_release_id     TEXT,
  capability_release_id  TEXT,
  feature_phase_label    TEXT,
  capability_phase_label TEXT,
  -- 1 when the canonical phase merge already resolves the phase conflict.
  phase_conflict_merged  INTEGER NOT NULL DEFAULT 0,
  resolution_state       TEXT NOT NULL DEFAULT 'unreviewed'
                           CHECK (resolution_state IN (
                             'unreviewed', 'mapping_wins', 'table_wins',
                             'both_correct', 'defect_raised'
                           )),
  resolution_note        TEXT,
  resolved_at            TEXT,
  source                 TEXT NOT NULL DEFAULT 'mapping'
                           CHECK (source IN ('mapping', 'sequencing', 'both', 'manual')),
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (pwc_feature_id, capability_id)
);

CREATE INDEX IF NOT EXISTS idx_feature_capabilities_conflicts
  ON pwc_feature_capabilities (resolution_state, release_conflict, phase_conflict);
