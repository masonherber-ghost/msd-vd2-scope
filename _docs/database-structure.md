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

### `notes`
Created by `001_create_notes.sql`. A minimal entity proving the full chain:
migration → repository → route → api-client → hook → component.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key, autoincrement |
| `text` | TEXT | Not null. Trimmed and length-capped (500) in the route, not the schema |
| `created_at` | TEXT | UTC, `datetime('now')` |

Index: `idx_notes_created_at` on `created_at DESC`.

Listed newest-first by `id DESC` in `getAllNotes()`. `id` rather than
`created_at`, because `datetime('now')` has one-second resolution — two notes
saved in the same second would otherwise order arbitrarily.

## Conventions

- **All SQL lives in `server/repositories/`.** Never in a route handler.
- **Statements are prepared lazily** (`??=`). Preparing at module load runs
  before migrations have created the tables and throws on first boot.
- **`RETURNING`** hands back the inserted row, avoiding a second SELECT.
- User input is always bound with `?` placeholders, never interpolated.

## Backups

`npx tsx scripts/backup-db.ts` → `server/backups/msd-vd2-scope-<timestamp>.db`.

Uses `VACUUM INTO`, **not** a file copy: under WAL mode recent commits live in
the `-wal` file, so copying the `.db` alone produces a snapshot that is missing
data while still opening as a valid database. The script verifies the snapshot
is readable and reports its table count.

`server/backups/*.db` is exempted from the `*.db` gitignore rule so a snapshot
can be committed deliberately.
