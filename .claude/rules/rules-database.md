# Database

This app has no SQL database and no migrations. Data lives in Firestore and the
browser talks to it directly.

**See [`rules-firebase.md`](rules-firebase.md)** for the conventions, the read
model, how a write works, and the steps for a data change.
`_docs/database-structure.md` describes every collection and field.

> Until 2026-10-09 this file described SQLite tables, `better-sqlite3` prepared
> statements and numbered `.sql` migrations in `server/migrations/`. All of that
> went with the Express server in the serverless migration. Following the old
> instructions would produce migration files that nothing runs.

## Backups

- `/backup-db` — the whole store to a JSON file in `backups/`, and restore.
- `backups/sqlite/msd-vd2-scope-final-pre-firestore.db` — the final SQLite
  database, committed as the permanent rollback copy. `admin/seed-firestore.ts`
  can load it into an empty store.
