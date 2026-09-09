> [!WARNING]
> **status: future — NOT ACTIVE.** This project currently uses SQLite (`better-sqlite3`) via Express.
> This file describes a **planned** Firebase target state. Do **not** follow it for day-to-day work —
> data changes follow `rules-database.md`. Read this only when running `/migration-plan`, or when
> explicitly asked about the Firebase migration.

# Firebase / Firestore Workflows

The app is serverless: React talks directly to Firestore via `src/lib/firestore-client.ts`, gated by Firebase Auth and `firestore.rules`. There is no backend server and no SQL. Read `_docs/app-setup.md` → "Data architecture" before any data work.

---

## Firestore facts & conventions

**Project: `big-rocks-c23cd`** (Blaze plan). Everything lives under `users/{uid}/…`; the security rules pin all access to the owner UID.

### Data conventions (verbatim from the old SQLite schema — do not "modernise")

| Kind | Convention |
|------|-----------|
| **Field names** | `snake_case` (`kanban_order`, `is_complete`) |
| **Booleans** | `INTEGER`-style `0` / `1` (check as `=== 1` in JS) — never `true`/`false` |
| **Dates/timestamps** | UTC **strings**, mixed `"YYYY-MM-DD HH:MM:SS"` and ISO-T formats, compared lexicographically (`utcNow()` in `derive.ts`) — never Firestore `Timestamp` |
| **Enums** | plain strings (`'today' \| 'weekend' \| 'week' \| 'radar' \| 'backlog'`) — validate in `firestore-client.ts`, not in rules |
| **IDs / FK fields** | **strings** (legacy numeric-string IDs and Firestore auto-IDs coexist; sort fallbacks use `idNum()` from `derive.ts`) |
| **Missing values** | `null`, never `undefined` — Firestore rejects `undefined`; strip with the `defined()` helper |
| **1:1 / small child data** | embedded, not subcollections: `checklist_items` array on task docs, rock `status` on category docs, dump items on session docs |

### What Firestore does NOT have (vs SQL)

| SQL habit | Firestore reality |
|---|---|
| Migrations | None — schema-on-write. New fields: set at creation AND treat as absent-with-default in `derive.ts` for legacy docs, or run a backfill script (see below) |
| Joins / COUNT / GROUP BY | Client-side derivation over the three base datasets (`src/lib/derive.ts`) |
| `AUTOINCREMENT` | Auto-IDs are random strings with **no sort order** — always set explicit `kanban_order` / `display_order` at creation (`Date.now()` = "sorts last") |
| Server-side defaults / `updated_at` triggers | The client sets `created_at` / `updated_at` (`utcNow()`) on every write |
| Multi-row transactions | `writeBatch` for multi-doc writes (reorders, batch toggles, dump confirm) |
| Cheap `SELECT *` | **Every document read is billed.** Reads are the thing you optimise |

---

## The read model — non-negotiable

The app makes exactly **three collection reads** (`['tasks']`, `['categories']`, `['layers']` in `src/hooks/useBaseData.ts`). Every view derives from them via pure functions in `src/lib/derive.ts`.

- **Never add a per-view Firestore query.** One new `getDocs` per view mount silently reintroduces the multiplied-read problem the migration removed.
- **Tasks are query-filtered** to `archived_at == null` — mandatory, not an optimisation (archived grows forever and would be billed on every fetch).
- **Categories are read whole**, including soft-deleted (`deleted_at != null`) — the clash signal counts statuses on deleted rocks. Filter deleted in derive functions, matching the legacy semantics.
- **Mutations patch the cache** (`useTaskCache` / `useCategoryCache` in `useBaseData.ts`) — 1 write, 0 reads. On error, `invalidateTasks()` — one refetch, never a fan-out of query keys.
- Equality-only filters need no composite index; add entries to `firestore.indexes.json` only when a query error demands one.

---

## Data change — add or modify a collection or field

1. **Types** — update the interface in `src/lib/firestore-client.ts` (and `Raw*` types in `src/lib/derive.ts` if it's on tasks/categories/layers). IDs/FKs are strings; follow the conventions table above.
2. **Writes** — add or extend the `apiClient.*` method in `firestore-client.ts`: `setDoc`/`updateDoc`/`deleteDoc`, `writeBatch` for multi-doc, always `updated_at: utcNow()`, always strip `undefined`.
3. **Legacy docs** — existing docs won't have the new field. Either handle absence in `derive.ts` (`t.new_field ?? default`) or backfill (step 6).
4. **Derive** — if any view consumes the field, thread it through the relevant function in `src/lib/derive.ts`. Derives are pure; keep them that way.
5. **Hook** — mutation in `src/hooks/` that calls the client and patches the base cache via `useTaskCache`/`useCategoryCache`; `onError` → single invalidate.
6. **Backfill (if needed)** — script in `scripts/` using `firebase-admin` (pattern: `scripts/migrate-to-firestore.ts`; `--emulator` flag for a dry run, `scripts/service-account.json` for production, verify counts in-script).
7. **Rules** — new subcollections under `users/{uid}/` are already covered by the wildcard rule. Anything else needs a rule **and** a case in `src/test/firestore-rules.test.ts`.
8. **Tests** — `npm test`; rules tests need the emulator (`npm run emulators`, or `npx firebase emulators:exec --only firestore "npx vitest run src/test/firestore-rules.test.ts"`).

---

## Security rules

- `firestore.rules` — one wildcard rule pinning everything to the owner UID. Deploy: `npx firebase deploy --only firestore:rules`.
- Rules are the **only** security boundary — the web config values in `.env` are public identifiers.
- Any rules change: update `src/test/firestore-rules.test.ts` (owner allowed / other UID denied / unauthenticated denied) and run against the emulator before deploying.

## Emulators

- `npm run emulators` — Auth 9099, Firestore 8080, Functions 5001, UI 4000; data persists in `.emulator-data/`. Requires Java (installed at `~/.local/share/java`, on PATH via `~/.zshrc`).
- `VITE_USE_EMULATORS=true` in `.env` points the app at the emulators (restart Vite after changing). Emulator auth is separate — seed the owner user with `scripts/seed-emulator-auth.ts`.
- End-to-end sanity: `scripts/emulator-smoke.ts`.

## Backups

- Firestore: use Firebase console export / scheduled backups.
- The final pre-migration SQLite snapshot lives in `backups/` (committed) — the permanent rollback artifact. `better-sqlite3` is kept as a devDep so scripts can still read it.
