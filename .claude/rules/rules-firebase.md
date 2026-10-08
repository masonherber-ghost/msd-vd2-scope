# Firebase / Firestore

The app is **serverless**: React reads and writes Firestore directly, Firebase
Auth says who is signed in, and `firestore.rules` decides what they may touch.
There is no backend server, no SQL and no migrations.

---

## Facts

| | |
|---|---|
| Project | `vd2-scope` (Spark plan — no Cloud Functions) |
| Auth | Google sign-in. **Single owner**: `firestore.rules` pins every read and write under `users/{uid}/…` to one UID. Any other Google account can sign in and is denied everything |
| Data | `users/{owner UID}/` — one collection per former SQLite table |
| Rules tests | `src/test/emulator/firestore-rules.emulator.test.ts` |

### Collections

`releases`, `phases`, `pwc_features`, `mvp_features`, `capabilities`,
`pwc_feature_mvp_features`, `pwc_feature_capabilities`, plus the counter
document `meta/sequences`. The names, and `docId` for each, are in
`src/lib/scope-records.ts`. `_docs/database-structure.md` has every field.

### Conventions — verbatim from SQLite; do not "modernise"

| Kind | Convention |
|---|---|
| Field names | `snake_case`, stored exactly as the API rows (`release_id`, `notes_edited`) |
| Flags | `0` / `1` integers — check `=== 1`, never booleans |
| Timestamps | UTC **strings** `YYYY-MM-DD HH:MM:SS` from `utcNow()` — never Firestore `Timestamp` |
| Ids | the row's own `id` field; the document id is `String(id)`. Feature-to-MVP links have a composite id `F-001__12` |
| New numeric ids | `meta/sequences` counter + 1, read and bumped inside the write's transaction — AUTOINCREMENT semantics, never a reused id, never `max + 1` |
| Missing values | `null`, never `undefined` (Firestore rejects it) |
| Removed links | **tombstoned** (`removed_at` set), never deleted — a re-import must not undo a deliberate removal. The derive hides them |
| `capabilities.source_text` | the wording the source document used; re-import matches on it. Hidden from the UI |

These shapes are why the move from SQLite touched no component: the stored
document *is* the API row. Changing one means changing every reader.

---

## The read model

The dataset is **bounded** (~400 documents, growing only when someone adds
scope), so the app reads the whole store **once** and derives every view.

- `src/lib/scope-store.ts` — `load()` is the only read: seven collection reads.
  The store is then held in memory; every write is planned against it.
- `src/lib/scope-graph.ts` — `deriveScopeGraph(raw)` builds the graph every
  view renders, in the old server's row order (byte-order collation).
- `useScope()` — one query, `staleTime: Infinity`, no refetch on focus.
  A reload picks up edits made on another device.
- **A tab opened from the app borrows, it doesn't load.** The print view opens
  in a new tab with an empty cache; `useScope({ fromOpenTab: true })` asks the
  open tabs over a `BroadcastChannel` for the same user's held store (zero
  reads) and only loads if none answers within 500 ms. Any new view that opens
  in its own tab should do the same.

### Non-negotiable

- **Never add a per-view, per-row or per-component Firestore read.** Derive
  from the graph. One extra `getDocs` per view mount silently multiplies the
  bill — the single regression this architecture exists to prevent.
- **Never write to Firestore except through a planner** (below). A direct
  `setDoc` bypasses validation, the counters and the held store, and the next
  plan overwrites it.
- **After a write, sync — never refetch.** Hooks call
  `syncScopeAfterWrite(queryClient)`, which puts the graph the write produced
  straight into the cache: one commit, zero reads.
- The scope query reads ~400 billed documents; never put it on a timer.

---

## How a write works

```
component → hook → apiClient.* (src/lib/api-client.ts, unchanged signatures)
          → scope-store.write()          queued: each plans on the last one's result
          → firestore-client.commit()    one transaction: read meta/sequences, apply the plan
          → plan<Action>(ctx, …)         src/lib/scope-plan.ts — PURE
```

A **planner** (`src/lib/scope-plan.ts`) is a pure function of the held store:
it validates (zod, `src/lib/validators.ts`), refuses with
`ApiError(status, message)` exactly as the Express route did, works through a
`Draft` so later steps see earlier ones, and returns
`{ writes, sequences, next, result }`. Nothing about Firestore is in it, so it
is tested without an emulator.

The store has no foreign keys, unique indexes or CHECKs. **The planners are
where those live now**: existence of a placement, uniqueness of ids and of
(ref, option) and (ref, case-insensitive text), cascades on delete, the
dependent-count refusals, conflict recompute after any move. Keep them there.

---

## Data change — add or modify a field or collection

1. **Shape** — add it to the row type in `src/lib/api-client.ts` (the
   `Stored*` types in `scope-records.ts` extend those). Follow the conventions
   table. A new collection also needs `COLLECTIONS` and `docId` entries.
2. **Existing documents** won't have it. Either default it where it is read
   (`row.x ?? default` in the derive) or backfill with an admin script
   (`admin/`, dry run first, verify by reading back).
3. **Writes** — set it in the relevant planner(s) on create, and accept it in
   the zod schema for update. Update schemas are built from bare fields:
   in zod 4 a `.default()` still fires inside `.partial()` and would wipe
   fields the patch left out.
4. **Client** — a new action is a planner, a method on
   `createFirestoreClient()`, a method on `apiClient` with the same shape the
   rest use, and a hook that calls `syncScopeAfterWrite`.
5. **Derive** — thread it through `deriveScopeGraph` if a view needs it.
6. **Re-import** — if the sources produce it, set it in
   `admin/import/plan-import.ts` and decide whether an app edit protects it
   (as `notes_edited` protects notes).
7. **Rules** — anything under `users/{uid}/` is already covered. Anything else
   needs a rule **and** a case in the rules test.
8. **Test** — planner tests (`src/lib/scope-plan*.test.ts`,
   `scope-invariants.test.ts`), then `npm test` and `npm run test:emulator`.

---

## Testing

| Command | Covers |
|---|---|
| `npm test` | planners, derives, import planning, components — no emulator |
| `npm run test:emulator` | rules, **and the real client path**: Web SDK, signed in as the pinned UID, rules enforced, held store compared with a fresh read |

The emulator smoke test is the only one that proves the browser can read
anything — everything else is pure or goes through the Admin SDK, which
bypasses rules. Run it after any data-layer change. Needs Java.

The emulator does not enforce composite-index requirements; the app uses no
filtered queries today, so `firestore.indexes.json` is empty.

`npm run emulators` runs them interactively (UI on :4000); set
`VITE_USE_EMULATORS=true` in `.env` and restart Vite to point the dev app at
them. Seed them with `admin/seed-firestore.ts --emulator`.

---

## Admin scripts (`admin/`)

Node scripts using the **Admin SDK, which bypasses the rules**. They are not
the app's data layer. See `admin/README.md`.

- Re-import the source documents — `/import-scope` skill
- Back up and restore — `/backup-db` skill
- `admin/service-account.json` is a real secret (gitignored). Never commit it,
  never paste it into a chat.

## Deploying rules

```bash
npm run test:emulator                              # rules tests first
npx firebase deploy --only firestore:rules
```
