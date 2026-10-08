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
| `sqlite-export.ts` | Reads the old SQLite database into the stored-document shape, verbatim |
| `seed-firestore.ts` | One-time copy of SQLite into `users/{uid}/`, then reads it all back and compares. Refuses to overwrite a non-empty store without `--force` |

```bash
# Dry run against the local emulator
npx firebase emulators:exec --only firestore \
  "npx tsx admin/seed-firestore.ts --uid <UID> --emulator"

# Production
npx tsx admin/seed-firestore.ts --uid <UID>
```
