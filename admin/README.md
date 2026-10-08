# admin/

Node scripts that talk to Firestore with the **Admin SDK**.

**This is not the app's data layer.** The app reads and writes Firestore from the
browser through `src/lib/firestore-client.ts`, where `firestore.rules` decides
what is allowed. Everything here uses a service account and **bypasses the
rules entirely** — it can read and overwrite anything in the project. Run it
deliberately, never from the app.

Some logic is duplicated between here and `src/lib/` (both know the document
shapes). That is accepted: the two serve different callers — a browser session
bound by rules, and a trusted Node process.

## Credentials

Production scripts need a service account key at `admin/service-account.json`
(gitignored — it is a real secret):

Firebase console → Project settings → Service accounts → Generate new private key.

Emulator runs (`--emulator`) need no key.

## Scripts

| Script | Does |
|---|---|
| `import-scope.ts` | Re-imports the source documents in `_docs/`. Dry run by default; `--apply` writes and verifies. Run through the `/import-scope` skill |
| `backup-firestore.ts` | The whole store to `backups/firestore-<stamp>.json` (`npm run backup-db`) |
| `restore-firestore.ts` | Makes the store exactly a backup file. Dry run by default; `--apply` writes |
| `seed-firestore.ts` | One-time copy of the old SQLite database (default: the final snapshot in `backups/sqlite/`) into an **empty** store. Refuses a non-empty one without `--force` |
| `firestore-admin.ts` | Shared: connect, read the store, per-document diff, commit, verify |
| `sqlite-export.ts` | Reads an SQLite database into the stored-document shape, verbatim |
| `import/` | The source parsers, reconciliation, declared overrides, and `plan-import.ts` — the re-import planned against the store |

Every script takes `--emulator` to run against the local emulator instead, and
defaults the owner UID to the one pinned in `firestore.rules`.

```bash
npm run import-scope                 # dry run
npm run import-scope -- --apply      # write
npm run backup-db
npx tsx admin/restore-firestore.ts backups/firestore-<stamp>.json            # dry run
npx tsx admin/restore-firestore.ts backups/firestore-<stamp>.json --apply
```
