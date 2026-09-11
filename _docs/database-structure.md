# Database structure

SQLite via `better-sqlite3`, at `server/msd-vd2-scope.db` (gitignored, along with
its `-wal` and `-shm` companions). Migrations in `server/migrations/` run on
server start, in filename order, each in a transaction, recorded in `migrations`
so they apply once.

## Connection

Set in `server/database.ts`:

| Pragma | Value | Why |
|---|---|---|
| `journal_mode` | `WAL` | Better concurrent reads |
| `foreign_keys` | `ON` | Off by default in SQLite — without it `ON DELETE CASCADE` silently does nothing and orphans child rows |

## Tables

### `migrations`
Created by the runner itself, not by a migration file.

| Column | Type | Notes |
|---|---|---|
| `name` | TEXT | Primary key — the migration filename |
| `applied_at` | TEXT | UTC, `datetime('now')` |

### `notes` — dropped
Created by `001_create_notes.sql` as `/setup-site`'s end-to-end verification
vehicle, then dropped by `003_drop_notes.sql`. `001` is deliberately left
untouched: an applied migration is never edited.

### Scope tables
Created by `002_create_scope_schema.sql`, modelling PRD §6. Every table carries
`source` (`mapping` | `sequencing` | `both` | `manual`), `created_at` and
`updated_at`, so a manually created row stays distinguishable from an imported
one forever (R-9.9).

| Table | Rows after import | Notes |
|---|---|---|
| `releases` | 6 | Union of both sources; `in_mapping_source` / `in_sequencing_source` record which one had it |
| `phases` | 7 | Canonical, ordered 1–7. `epic_ref` is free text and **not** unique — 186 appears on two phases (D-2) |
| `pwc_features` | 48 | `id` checked against `F-[0-9][0-9][0-9]`. IDs are sparse and the gaps mean nothing |
| `assumptions` | 92 | Ordered per feature, contiguous 1..n |
| `mvp_features` | 51 across 48 refs | Unique on `(ref, scope_option)` |
| `capabilities` | 107 | Identity is `(mvp_ref, LOWER(text))` |
| `pwc_feature_mvp_features` | 60 | Join |
| `pwc_feature_capabilities` | 122 edges / 123 citations | Join, plus the conflict columns |

**Two constraints are expression indexes, not plain `UNIQUE`, and both matter:**

- `mvp_features (ref, IFNULL(scope_option, ''))` — SQLite treats NULLs as
  *distinct* in a unique index, so `UNIQUE(ref, scope_option)` would silently
  accept two bare records for the same ref.
- `capabilities (mvp_ref, LOWER(text))` — encodes the case-insensitive dedup
  rule, so `Filter and Sort Applications` and `Filter and sort applications`
  cannot both exist under ref 980.

An upsert onto either must repeat the same expression in its `ON CONFLICT`
target, or SQLite cannot match the index.

**`capabilities.question`** holds a question someone raised about a capability. It is not
a source disagreement, so it stays out of every conflict count, and setting it does not
flip `source` to `manual` — an annotation is not an edit of what the document said.

**`capabilities.source_text` is what the import matches on, not `text`.**
Identity by wording is right for the documents and wrong the moment someone
corrects a typo: the import still carries the original text, matches nothing,
and inserts a second capability beside the renamed one — 107 rows became 108.
`source_text` records what the document said, so a renamed row is still
recognised as the one that text belongs to. It is `NULL` for a capability
created by hand, because no document named it and no import should claim it;
the lookup falls back to `text` in that case, and for any row written before
the column existed.

**`pwc_feature_capabilities.source_citations`** exists because F-079 cites both
casings of ref 980 — one capability, cited twice. That is one edge carrying 2
citations, so 123 parsed links become 122 rows and `SUM(source_citations)`
still reconciles to 123.

**`capabilities.mvp_feature_id` is nullable, and `mvp_ref` is kept alongside
it.** Ten capabilities belong to a ref with more than one MVP record (938, 946,
951), where the source never says which. The owner is chosen by rule — prefer
the bare record, else the lowest option — and flagged with
`mvp_owner_ambiguous`. Keeping `mvp_ref` means changing that answer (D-3) is an
`UPDATE`, not a migration.

**`capabilities.release_id` and `phase_id` are nullable** even though R-9.3
requires both, because the one unmatched mapping-only capability genuinely has
no placement. The CRUD path enforces the requirement in its validator.

**Cascades (R-9.4):** `assumptions` and both join tables cascade from their
parent. `pwc_features`, `releases`, `phases` and `mvp_features` never cascade
silently — the route refuses the delete and names what depends on it, using the
`count*Dependents` repository functions.

## Conventions

- **All SQL lives in `server/repositories/`.** Never in a route handler.
- **Statements are prepared lazily** (`??=`). Preparing at module load runs
  before migrations have created the tables and throws on first boot.
- **`RETURNING`** hands back the inserted row, avoiding a second SELECT.
- User input is always bound with `?` placeholders, never interpolated.

## Import

`POST /api/import` (or first boot on an empty database) parses both markdown
documents, reconciles them, and writes the result in one `db.transaction()`.

- **Drift fails before any write.** The reconciled counts are checked against
  the expected figures first; a mismatch throws and nothing is written (R-11.3).
- **Re-import is additive.** A row whose `source` is `manual`, and a link whose
  `resolution_state` is anything but `unreviewed`, are never overwritten
  (R-11.4). Both are enforced in the `WHERE` clause of each upsert.
- **Assumptions are replaced, not merged** — they are an ordered list with no
  stable natural key. Imported rows are deleted and rewritten, manual ones are
  kept, then positions are renumbered contiguously.
- After the first run, import is explicit only; boot verifies and logs but does
  not re-import.

## Backups

`npx tsx scripts/backup-db.ts` → `server/backups/msd-vd2-scope-<timestamp>.db`.

Uses `VACUUM INTO`, **not** a file copy: under WAL mode recent commits live in
the `-wal` file, so copying the `.db` alone produces a snapshot that is missing
data while still opening as a valid database. The script verifies the snapshot
is readable and reports its table count.

`server/backups/*.db` is exempted from the `*.db` gitignore rule so a snapshot
can be committed deliberately.
