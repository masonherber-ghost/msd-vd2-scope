---
name: firestore-read-audit
description: Audit and protect Big Rocks' Firestore read cost — map every read, check the seven regression patterns (per-view getDocs, invalidation fan-out, read-before-write, max-order reads, QueryClient drift, unbatched loops, new query keys), and report findings ranked by reads × frequency. Use when asked to check read cost, audit Firebase calls, investigate a Firestore bill, or before shipping a feature that touches the data layer. Carries the record of the fetch-once-derive-many refactor.
---

# Firestore Read Audit

Measure what the app costs to read, and protect the "fetch once, derive many" architecture from regressing. **This skill does not restate the read model** — that is [`.claude/rules/rules-firebase.md`](../../rules/rules-firebase.md) § The read model. This is how to *measure* it and how to *spot* a regression.

**Read first:** [`.claude/rules/rules-firebase.md`](../../rules/rules-firebase.md), then the APPENDIX below — why the architecture is shaped this way.

Every Firestore document read is billed. At this app's volume the design sits comfortably inside the free tier, but the failure mode is silent: one per-view query added in a feature commit multiplies reads without breaking anything visible.

## Step 0 — Know the budget

Audit against these numbers, so a finding can be weighed rather than merely flagged.

| Event | Reads | Writes |
|---|---|---|
| Cold app load (tasks + categories + layers) | ~230 | 0 |
| Any view navigation inside the 5-min `staleTime` | 0 | 0 |
| Complete / toggle / drag-drop / checklist tick | 0 | 1 |
| Create or delete a task or rock (one invalidation) | ~200 | 1 |
| Brain-dump session (20 items) | 0 (cached context) | ~21 (1 batch) |

A heavy day (~3 loads, ~60 interactions, a few creates) should land at **1.5–2K reads, <100 writes** — ~3% of the free tier (50K reads / 20K writes per day). **Anything that pushes an interaction off the `0 reads` row is the finding.**

## Step 1 — Map every read

All Firestore access funnels through one file, so the read surface is greppable:

```
grep -n "getDocs\|getDoc(" src/lib/firestore-client.ts
grep -rn "useQuery" src/hooks/
```

Baseline at the time of writing: **12 call sites** in `firestore-client.ts`, three of them the base reads in `apiClient.raw` — tasks filtered `archived_at == null`, categories whole, layers whole. Classify every other site as one of:

- **Documented bounded exception** — `getArchivedByCategory` is the only sanctioned one: archived tasks are excluded from the base cache on purpose, so they are fetched on demand, scoped to one category.
- **Mutation-time read** — a read inside a write path. Nearly always a regression (Step 2).
- **Regression** — anything a screen can reach that isn't the three base queries.

Then check query keys: beyond `['tasks']`, `['categories']` and `['layers']`, no key should be mounted persistently by a screen.

## Step 2 — The seven regression patterns

| Pattern | How to spot it | Why it costs |
|---|---|---|
| **Per-view `getDocs`** | a `getDocs` reachable from a screen's hook | every view mount re-reads what another view already cached |
| **Invalidation fan-out** | a mutation invalidating 2+ query keys | 1 tap → N refetches; this was ~600 reads per completed task before the refactor |
| **Read-before-write** | `getDoc`/`getDocs` at the top of an `apiClient` mutation | the doc is already in the `['tasks']` cache — pass in what you need, or derive it |
| **Max-order read at create** | `getRaw*()` then `Math.max(…)` to pick an order | a whole-collection read per create; `tasks.create()` uses a `Date.now()` sentinel instead |
| **QueryClient drift** | defaults missing from `src/app/_layout.tsx` | `staleTime: 0` + `refetchOnWindowFocus: true` refetches every mounted query on focus |
| **Unbatched loop** | `.map(t => mutate(t))` over a list | N writes + N refetches instead of one `writeBatch` |
| **New persistent query key** | a `useQuery` outside `useBaseData.ts` | a fourth collection read on every load |

The fix is nearly always the same: **derive it from the cached base queries** (0 reads) instead of asking Firestore again.

## Step 3 — Check the write path

- **`writeBatch` for multi-doc writes** — reorders, batch toggles, dump confirm. Never a sequential loop.
- **Fractional ordering** — `between(prev, next)` in `src/lib/order.ts` returns the midpoint, so a drag writes **one** document instead of renumbering the list.
- **Explicit orders at create** — auto-IDs have no numeric sort fallback, so set `kanban_order`/`display_order` from a clock, never from a read.
- **Text edits save on blur with a dirty check** — this is the app's debounce. There is deliberately **no** `debounce`/`throttle`/`setTimeout` in `src/`; a no-op blur must write nothing.
- **One-shot `getDocs`, never `onSnapshot`** — one user on one device gains nothing from live sync, and a listener would undo the `staleTime`-plus-patch model.

## Step 4 — Report findings

Per finding: `file:line`, which pattern, **reads per occurrence × how often the user does it**, and the fix. Rank by that product, not by count — one read on the checkbox path outweighs a whole-collection read on a rarely-used delete.

**Report before fixing.** Replacing a read with a cache patch is a cache-coherence decision, not a mechanical cleanup — it needs a deliberate yes.

## Step 5 — Verify

If fixes were applied: `npx tsc --noEmit` clean; run on the **iOS 18.2** simulator (18.4 breaks Firebase) and exercise every derived view that reads the patched data — a read replaced by a cache patch must leave **no** view stale. Re-run Step 1 and confirm the call-site count moved as claimed. No `console.log`.

---

# APPENDIX — the record (audit 2026-07-04)

The surviving summary of `_docs/firebase-migration-plan.md` § Phase 0 from the retired web repo — the audit that produced the current design.

**The situation.** Migrating from Express + SQLite to Firestore. On SQLite a per-view endpoint is nearly free; on Firestore every document read is billed and network-bound. The existing call patterns, ported 1:1, would have multiplied cost badly.

**What the audit found**, at ~200 tasks:

| Pattern | Cost if ported as-is |
|---|---|
| `new QueryClient()` with defaults (`staleTime: 0`, `refetchOnWindowFocus: true`) | every focus refetches every mounted query — hundreds of reads per alt-tab |
| Every mutation invalidating 2–4 query keys | completing 1 task → 4 refetches ≈ **600 reads**; one drag-drop ≈ **450 reads** |
| Six overlapping per-view query keys, all returning task data | each view mount re-reads what another view already fetched |
| Unbatched loops — "Clear All" fired one mutation per task | 5 tasks = 5 writes + ~20 refetches |
| Server-side N+1s — per-category COUNT, per-rock neglect subqueries | disappear for free under derive-from-cache |

Ported naively, a 50-interaction day ran ~25–30K reads. **Fixed, the same day is ~1.5–2K.** The fixes also removed the refetch-after-every-drag jank, so this was a UX win as well as a cost one.

**The decisions that followed** — all still binding:

1. **Fetch once, derive many** — three base queries are the only collection reads; every view derives client-side via pure functions in `derive.ts`.
2. **Surgical cache updates over broad invalidation** — high-frequency mutations patch `['tasks']` via `setQueryData`: 1 write, 0 reads. When a patch cannot mirror the write exactly, fall back to **one** invalidation, never a fan-out.
3. **TanStack Query + `getDocs`, not `onSnapshot`** — single user, single device; live sync buys nothing.
4. **Filter archived at the query level** — archived tasks grow forever; an unfiltered whole-collection read would bill them on every fetch. Mandatory, not an optimisation.
5. **Categories read whole, including soft-deleted** — the clash signal counts deleted rocks' statuses; filter `deleted_at` inside derive.
6. **Embed 1:1 and small child data** — `checklist_items` on the task doc, rock `status` on the category doc: a toggle is one atomic write and there are no per-item reads.
7. **`staleTime: 5 * 60 * 1000` + `refetchOnWindowFocus: false`** as QueryClient defaults.

**What made the refactor work**, worth repeating on any similar job: the efficiency work was done **first**, while the old stack was still the source of truth, so the derive functions could be *oracle-tested* — assert `derive*(raw)` deep-equals the legacy endpoint response on real data — before any Firebase code existed. The hardest correctness work was proven while a reference implementation still existed to check against. One committed checkpoint per phase, each leaving the app fully working.

**The standing risk**, in the original author's words: *any future feature that adds its own `getDocs` per view, instead of deriving from the base queries, silently reintroduces the multiplied-read problem.* That is what this skill exists to catch.

Related: [`.claude/rules/rules-firebase.md`](../../rules/rules-firebase.md), [`.claude/rules/rules-ai-api-firebase.md`](../../rules/rules-ai-api-firebase.md).
