---
name: express-to-serverless
description: Migrate a React app off an Express/SQL backend to browser-direct Firestore, Cloud Functions for secrets, and static hosting. Use when asked to remove a server, host a React app on shared hosting/cPanel, go serverless, or replace an API layer with Firebase. Covers the full execution, not just the plan.
---

# Express → serverless (Firestore + Functions + static hosting)

Removes the server. The browser talks to Firestore directly, `firestore.rules`
becomes the authorisation layer, Cloud Functions hold the only secrets, and the
host serves files.

**Related but different:** `/migration-plan` writes a plan for *any* migration.
`/setup-deploy-pipeline` stands up the hosting pipeline alone.
`/firestore-read-audit` polices read cost afterwards. This skill is the
end-to-end execution, and assumes you will invoke the other two as steps.

---

## Step 0 — Is this migration appropriate?

**Yes, when the backend only does CRUD + auth.** Both have managed equivalents
that enforce on their own servers, so the client can talk to them directly and
the host's job collapses to serving files.

**No, or not entirely, when something must run where the user cannot tamper
with it:** secrets, inbound webhooks, scheduled jobs, third-party APIs with
billing attached, server-rendered HTML, or any correctness that depends on the
client not lying. Each of those needs a function — which is fine. What is *not*
fine is discovering it late.

Inventory the server before planning. For each route, mark: pure CRUD (moves to
the client), computed response (becomes a derive), or secret-bearing (becomes a
function). **Report the inventory and stop for confirmation.**

### Say this out loud if the target is shared hosting

Shared hosting cannot run your code at all. If even one endpoint is
secret-bearing, you still need a function host somewhere. "Everything on shared
hosting" is usually not reachable — say so before starting, not after.

---

## Step 1 — Decide the read model. Do not copy one.

Every document read is billed. The server hid N queries behind one response; now
each is visible and charged. The fix is *fetch once, derive many* — but **how
much you can fetch once depends on the data's shape**, and this is the decision
most likely to be got wrong by copying a previous project.

| Data shape | Model |
|---|---|
| **Bounded working set** (tasks, categories, a config tree) | A few read-everything base queries. Every view derives. |
| **Time series that grows forever** (logs, meals, events, messages) | **Two tiers.** Tier A: small reference collections, read whole and cached. Tier B: journal data, read by bounded date window, never whole. |

Measure before choosing: count documents per collection and the growth rate. A
collection gaining rows daily can never be a read-everything base query — it
just fails later and more expensively.

**The rule that survives either model:** no per-view, per-row or per-day query.
One range query plus a client-side group-by, never `useThing(id)` inside a
component that renders in a list.

---

## Step 2 — Phases

Each leaves the app working. Commit one per phase. **The old server stays the
source of truth until the second-to-last phase.**

| # | Phase | Gate |
|---|---|---|
| 0 | Rules, emulators, client SDK wiring | Rules tests pass |
| 1 | Data client — port repositories to the Web SDK | Typechecks; not yet wired in |
| 2 | Derive functions — port computed responses | **Oracle tests pass (Step 3)** |
| 3 | Swap hooks; cache patching | App works with the server stopped |
| 4 | Cloud Functions for secrets | Functions load in the emulator |
| 5 | Delete the server | Suite green; coverage moved, not lost |
| 6 | Static hosting + pipeline | Build gate fires; smoke test passes |
| 7 | Rewrite CLAUDE.md and the rules files | No stale instructions remain |

### Preserve the field shapes verbatim

If the server converted storage shapes to API shapes (snake_case, `0`/`1`
booleans, ISO date strings), **move that conversion into the client unchanged**.
It is the single thing that keeps the blast radius small: hooks, components and
types never learn the store changed. Resist "modernising" it during the move —
that turns a mechanical port into a rewrite of every component.

---

## Step 3 — Oracle-test the derives while the server still exists

This is the highest-value step in the whole migration and the window for it
closes permanently at Phase 5.

For each derive function, assert it produces output **identical to the server
implementation it replaces, on real data**:

```ts
check('deriveThing', deriveThing(rawInputs), await serverRepo.getThing(userId))
```

Call the server's own repository functions directly — no HTTP, no auth needed.
Compare **canonicalised** JSON (sort keys recursively); key order differs
between implementations and is not a contract. A mismatch there is a false
alarm that will cost you an hour.

Delete the oracle script with the server in Phase 5. Its job is done the moment
Phase 2 is green.

---

## Step 4 — Functions stay pure

**No Firestore access inside a function.** Input → model → structured output.
Persistence happens client-side so the cache patches keep working, and dynamic
context (lists, snapshots) is passed in the payload, built from data the client
already holds — which also costs zero extra reads.

This usually forces a split, because server routes commonly did extraction *and*
the writes it implied in one handler. Move the orchestration to a client module
and keep the write order identical. If that orchestration was pure logic (date
windows, defaults), it transplants unchanged — **check for existing tests on it
and move them too**.

### The two-timeout trap

For any call over ~60s:

- the function: `timeoutSeconds: 540` (v2 default is **60**)
- the caller: `httpsCallable(..., { timeout: 540000 })` (SDK default is **70s**)

Both are required and they fail differently. And note: **a Firebase Hosting
rewrite imposes a hard 60s ceiling that cannot be raised** — if a call exceeds
it, the app cannot sit behind Hosting at all. Check this before choosing a
hosting topology, not after.

---

## Step 5 — Verify the client path, not just the code

Unit tests, typechecks and oracle checks all run through the **Admin SDK, which
bypasses security rules entirely**. None of them proves the browser can read
anything.

Write one smoke test that uses the real Web SDK against the emulators with a
signed-in session, covering: every base read, every windowed read, the
inequality + `orderBy` queries, a write round-trip asserting the field-shape
contract, a document written in the *old* SDK's `Timestamp` shape, and a denial
outside the owner subtree — so a green run cannot mean rules were simply off.

Run it in a test runner that supplies `import.meta.env` (Vitest with a `define`
block), since the Firebase init module reads it.

**Seed the emulator user with the production UID.** Emulator auth mints its own
UIDs while rules pin the owner's, producing the classic symptom: sign-in works,
every read is denied.

**Caveat to state plainly:** the Firestore emulator does not enforce
composite-index requirements. A missing index can still appear only in
production — watch the first real run.

---

## Step 6 — What to do with server-side tooling

Scripts, agents and backfills that ran against the server's repository layer
will break when it is deleted, and they *cannot* use the client SDK because they
run in Node with a service account.

Do not silently break them, and do not keep `server/` to avoid the problem.
Move the repository layer to a directory named for what it now is (`admin/`),
with a README stating that it uses the Admin SDK, bypasses rules, and is **not**
the app's data layer. Accept the duplication with the client module explicitly —
the two serve different callers.

---

## Step 7 — Hosting

Three files must agree, or the deploy is silently broken:

| File | Setting |
|---|---|
| `vite.config.ts` | `base: '/sub/'` (trailing slash) |
| router | `basename: '/sub'` (no trailing slash) |
| `public/.htaccess` | `RewriteBase /sub/` + SPA fallback |

Then follow `/setup-deploy-pipeline` for the pipeline itself. Two things from it
that bite hardest: `include-hidden-files: true` on the artifact upload (the
default drops `.htaccess` and leaves the deploy green with no SPA fallback), and
never setting `exclude:` on the FTP action (it replaces the defaults wholesale).

**Verify the build gate actually fires.** Build once with the config env removed
and confirm the failure signature appears (Vite inlines a missing var as
`void 0` and still builds green). A gate that never fires is worse than none.

---

## Step 8 — Rewrite the rules files

Stale rules are worse than no rules: every future session loads them and is
actively misdirected. After the server is gone, a rules file still describing
SQL migrations will produce migration files that do nothing.

Rewrite or reduce to pointers: the database rules, the AI/API rules, the stack
rules' backend section, and `CLAUDE.md`'s architecture statement. Then grep for
the old stack's name across `CLAUDE.md` and the rules directory and confirm the
only hits are deliberate history.

---

## Failure modes seen in practice

| Symptom | Cause |
|---|---|
| Sign-in works, every read denied | Emulator minted its own UID; rules pin the owner's |
| Dates render as `[object Object]` | Admin SDK writes `{_seconds}`, Web SDK reads `Timestamp` — the converter must accept both |
| A long AI call dies at 70s | Callable SDK default timeout, not the function's |
| A long AI call dies at 60s behind Hosting | Hosting rewrite ceiling; it cannot be raised |
| Oracle mismatch that is only key order | Compare canonicalised JSON |
| Deploy green, site unchanged | `.htaccess` dropped by `include-hidden-files: false` |
| Read cost rises after migration | A per-view query crept in; run `/firestore-read-audit` |
| `npm ci` fails in CI but installs fine locally | Peer conflict `npm install` tolerates; test in a clean tree |
