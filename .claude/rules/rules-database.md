---
description: Step-by-step sequences for common ongoing development tasks
---

# Development Workflows

---

## Database change — add or modify a table, column, or index

1. **Write a migration file** in `server/migrations/` — name it with a numeric prefix matching the next sequence number (e.g. `016_add_user_goals.sql`). The migration must be idempotent (safe to re-run). Use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, etc.
2. **Update the repository** in `server/repositories/` — one file per entity (e.g. `meal-log-repository.ts`). Add or update query methods using the lazy prepared-statement pattern already established in those files. Use `better-sqlite3` prepared statements; never concatenate user input into SQL.
3. **Update API routes** in `server/routes/` — add or update endpoints that expose the new data. Route handlers call repository functions only; no SQL in routes.
4. **Update the frontend API client** in `src/lib/api-client.ts` — add typed functions for any new endpoints. Keep types aligned with what the server returns.
5. **Update the relevant hook** in `src/hooks/` — wire the new API client function into a TanStack Query `useQuery` or `useMutation`.
6. **Invalidate related queries** — after any mutation, invalidate the relevant query keys so the UI stays in sync.
7. **Run tests** — `npm test` and verify the migration runs cleanly on server start.
8. **Update `docs/feature-logic.md`** — if the change affects how a feature works (extraction logic, defaults, date handling, processing flow), update the relevant section so future Claude sessions understand the intent behind the behaviour.

---

## New page / route

1. **Create the page component** in `src/pages/` — compose from existing `src/components/` and `src/components/ui/` components.
2. **Add the route** in `src/main.tsx` or the router config — wrap the page in `React.lazy()` for code splitting.
3. **Add to navigation** — update the relevant nav component so the page is reachable.
4. **If the page needs data** — create or reuse a hook in `src/hooks/` using TanStack Query.
5. **Run tests** — verify existing tests still pass; add a basic render test for the new page.

---

## Database setup — from scratch

The one-time setup for a new project. Ongoing changes follow **Database change** above.

**SQLite is a file on the server**, not browser storage. Data lives in `server/<project-name>.db` and persists across restarts and deploys of the client. Nothing is in `localStorage` — that is only used for per-browser preferences like the theme.

### 1. Install and connect

`better-sqlite3` only — synchronous, fastest, and stable across Node upgrades. The async `sqlite3` package breaks on Node majors; do not use it.

```ts
// server/database.ts
export const DB_PATH = process.env.DB_PATH ?? path.join(here, '<project-name>.db')
export const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')   // better concurrent reads
db.pragma('foreign_keys = ON')    // OFF by default — ON DELETE CASCADE is inert without it
```

**Both pragmas matter.** `foreign_keys` is off by default in SQLite, so a `REFERENCES ... ON DELETE CASCADE` silently does nothing and you get orphaned child rows.

**`.gitignore` needs all three WAL files**, not just `*.db`:
```
*.db
*.db-journal
*.db-wal
*.db-shm
```

### 2. Migration runner

Numbered `.sql` files in `server/migrations/`, applied on server start in filename order, each inside a transaction, recorded in a `migrations` table so they run once.

- Name them `001_`, `002_`, … — filename order *is* apply order.
- Every migration must be idempotent: `CREATE TABLE IF NOT EXISTS`, `INSERT OR IGNORE`.
- Never edit an applied migration. Add a new one.
- Log which migrations ran on boot; "Migrations up to date" on a restart is the signal that tracking works.

SQLite's `ALTER TABLE` is limited — it has no `ADD COLUMN IF NOT EXISTS`. Adding a nullable column is safe and is the normal way to extend a table without a rebuild.

### 3. Repository per entity

One file per entity in `server/repositories/`. All SQL lives here — never in a route handler, never string-concatenated from user input.

**Prepare statements lazily, not at module load:**

```ts
let selectAll: Statement | undefined

export function getAll(): Row[] {
  selectAll ??= db.prepare(`SELECT ${COLUMNS} FROM things ORDER BY id`)
  return selectAll.all() as Row[]
}
```

Preparing at module load runs *before* migrations have created the tables, and throws on first boot. The `??=` pattern prepares once on first use and caches.

Other patterns worth reusing:

- **`RETURNING`** on INSERT/UPDATE hands back the full row — no second SELECT.
- **`db.transaction(fn)()`** for any multi-step write (insert-plus-reorder, duplicate-with-children). Rolls back automatically.
- **A correlated subquery** keeps a list endpoint to one round trip when each row needs a derived value:
  ```sql
  SELECT s.*, (SELECT b.image_path FROM blocks b
                WHERE b.story_id = s.id AND b.image_path IS NOT NULL
                ORDER BY b.position LIMIT 1) AS cover_image
    FROM stories s
  ```
- **`ON DELETE CASCADE`** on child tables so deleting a parent cleans up (needs the pragma above).
- **Explicit `position`/`display_order`** columns for anything user-ordered. Auto-increment ids are not an order.

### 4. Storing files — never blobs

Binary data (images, uploads, generated assets) goes to **disk**; the database stores only the filename.

- Write to `server/uploads/`, filename `${crypto.randomUUID()}.ext`
- Store just the filename in the row; build the URL in one place client-side
- Serve with `app.use('/uploads', express.static(UPLOADS_DIR))`
- `.gitignore` the directory

A single generated PNG is ~1–2 MB. Base64 in a text column bloats the file and every query that touches the row.

**The Vite proxy must forward the uploads path too** — a proxy that only covers `/api` returns the SPA `index.html` for `/uploads/x.png` with a 200 and `content-type: text/html`, which looks like a broken image with no error anywhere:

```ts
proxy: {
  '/api':     { target: 'http://localhost:3001', changeOrigin: true },
  '/uploads': { target: 'http://localhost:3001', changeOrigin: true },
}
```

### 5. Routes

Handlers call repository functions and nothing else.

**Never `throw` inside an `async` route handler.** Express 4 does not catch rejected promises, so the throw becomes an unhandled rejection that kills the process — the request just hangs and the server dies. Use `next(err); return`:

```ts
router.post('/', async (req, res, next) => {
  if (!valid) { next(new HttpError(400, 'Message')); return }   // async: next()
  try { res.json(await work()) } catch (e) { next(toFriendly(e)) }
})

router.get('/', (req, res) => {
  if (!valid) throw new HttpError(400, 'Message')               // sync: throw is fine
})
```

The same `throw` is safe in a synchronous handler, which is what makes this easy to get wrong.

Also: parse `:id` params and reject a non-integer *before* querying, or you run a query with `NaN`.

### 6. Client chain

`api-client.ts` (typed fetch, one function per endpoint) → hook (`useQuery`/`useMutation`) → component. Never `fetch` in a component.

- Invalidate the affected query keys in `onSuccess` — one invalidate, not a fan-out.
- Return a friendly message on failure: an unparseable 5xx usually means nothing handled the request, so treat it as "server unreachable" rather than showing a status code.
- When a mutation's result feeds a second call, chain it in `onSuccess` — reading `mutation.data` from an enclosing closure gives a stale value from the render it was created in.

### 7. Tests

- **Repositories:** real `better-sqlite3` with `:memory:`. Don't mock the database.
- **Pages/hooks:** a small **stateful fake API** whose writes mutate an in-memory store, so a POST-then-refetch genuinely round-trips. One canned response per path passes while the wiring is broken.
- Layout and overflow cannot be tested in jsdom — those need a real browser.

### 8. Document the schema

Keep a `_docs/database-structure.md`: table-by-table columns with notes, the key relationships, and any join that the app depends on. Call out the fields that silently break many pages if wrong. Future sessions read this instead of re-deriving the schema.
