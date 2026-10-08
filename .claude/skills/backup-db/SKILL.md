---
name: backup-db
description: Backs up the MSD VD2 Scope Firestore data to a timestamped JSON file in backups/, and restores one. Run before a re-import, a bulk edit, or periodically to protect against data loss.
---

The data lives in Firestore under `users/{owner UID}/`. Backups are JSON files
in `backups/` made with the Admin SDK (needs `admin/service-account.json` — see
`admin/README.md`).

## Back up

```bash
npm run backup-db
```

Report the output to the user exactly as printed (file and document count).
It costs about 400 document reads — the same as opening the app once.

Then remind the user:

> To persist this backup to git, run:
> ```
> git add backups/ && git commit -m "chore: data backup $(date +%Y-%m-%d)"
> ```

## Restore

Only when the user asks. A restore makes the store exactly what the file holds:
**every edit since the backup is lost**, and documents created since are deleted.

1. Take a fresh backup first (above), so the restore can itself be undone.
2. Dry run — shows what would change, writes nothing:
   ```bash
   npx tsx admin/restore-firestore.ts backups/firestore-<stamp>.json
   ```
3. Show the user the dry-run output and get explicit confirmation.
4. Apply, then tell the user to reload the app (an open tab holds the old data):
   ```bash
   npx tsx admin/restore-firestore.ts backups/firestore-<stamp>.json --apply
   ```

The final pre-Firestore SQLite database is kept in `backups/sqlite/` as a
permanent rollback copy; `admin/seed-firestore.ts` can load it into an empty store.
