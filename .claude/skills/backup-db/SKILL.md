---
name: backup-db
description: Creates a timestamped backup of the MSD VD2 Scope SQLite database in server/backups/. Run this periodically to protect against data loss.
---

Run the backup script:

```bash
npx tsx scripts/backup-db.ts
```

Report the output to the user exactly as printed (backup filename, size, and count).

Then remind the user:

> To persist this backup to git, run:
> ```
> git add server/backups/ && git commit -m "chore: db backup $(date +%Y-%m-%d)"
> ```
