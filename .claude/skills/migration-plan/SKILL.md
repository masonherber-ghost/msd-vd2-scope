---
name: migration-plan
description: Walks through standard steps, decisions, and review items to research and write a platform/stack migration plan (database, backend, auth provider, hosting, framework). Use when asked to plan any migration — e.g. "migrate this app to Firebase/Supabase/Postgres/Next.js".
---

# Migration Plan

Produce a phased, execution-ready migration plan document. Do not write any implementation code — the deliverable is the plan, saved to `_docs/<target>-migration-plan.md` (or the project's docs folder).

## Step 0 — Load the project's own context FIRST

Before asking questions or launching exploration, read what the project already documents about itself — don't rediscover it:

- **CLAUDE.md** and anything it mandates reading (e.g. an app-setup or architecture doc in `_docs/`/`docs/`)
- **`.claude/rules/*.md`** — these often encode source-store semantics that become migration design decisions (e.g. a database rules file documenting boolean-as-integer, dates-as-ISO-text, enum CHECK constraints → informs the "keep field shapes verbatim" strategy; an AI/API rules file documenting prompt architecture → constrains where server-side functions must live)
- **`.claude/skills/`** — note skills the plan should invoke as steps (e.g. a database backup skill becomes a mandatory step before the data migration and before cutover)

Use these to seed the exploration prompts in Step 2 (agents verify docs against actual code rather than sweeping blind), and cite the relevant rules/skills by name in the plan itself.

## Step 1 — Clarify decisions BEFORE researching

Ask the user up front (AskUserQuestion, one batch). These decisions reshape the entire plan, so never assume them:

1. **Target architecture** — e.g. serverless (client talks to the new platform directly) vs keep the existing API layer and swap only the storage/auth underneath vs hybrid. Recommend one and say why.
2. **Auth** (if in scope) — providers/methods (OAuth, email/password, magic link), and whether auth is new or replacing an existing system.
3. **User/tenancy model** — single user (auth as a lock), multi-user, multi-tenant. Drives data model scoping and security rules.
4. **Scope of this plan** — local dev only vs including hosting/deploy; big-bang cutover vs incremental.
5. **Ordering constraints** the user has stated (e.g. "auth first, then data") — honor them in the phase structure.

## Step 2 — Explore the current state (parallel Explore agents)

Launch 2–3 Explore agents in parallel:

**Agent A — backend/data:**
- Full schema: tables/collections, keys, relationships, constraints, enums, soft deletes, triggers
- Repositories/DAL: complex queries (joins, aggregations, transactions) — these are the hard translation points
- API surface: endpoint groups, middleware, any existing auth
- Services with secrets (AI APIs, email, payments) — these can never move client-side
- Data volume (row counts, backups, seed data) — small volume often means client-side computation is viable
- Uncommitted/pending schema changes in the working tree

**Agent B — frontend/data layer:**
- API client: size, structure, types (note ID types and field conventions)
- Data-fetching hooks/stores: patterns, cache keys, invalidation
- Auth today: login UI, guards, user context (often a stub — check)
- App entry/providers and router — where auth wiring goes
- Env/config: proxies, env vars, how the frontend reaches the API

## Step 3 — Review performance & efficiency of data calls (cost-model the target)

The old stack's calls are usually free and local; the target's are often **billed per read/write and network-bound** (Firestore, Supabase, DynamoDB, any hosted DB). Audit the *call patterns* — not just the schema — and fix wasteful ones **before** migrating, so the new stack inherits an efficient access pattern instead of multiplying a wasteful one:

- **Cache/refetch defaults** — check the query-library config (e.g. TanStack Query `staleTime: 0` + `refetchOnWindowFocus: true` defaults mean every tab-focus refetches everything). On a billed backend this is a silent cost multiplier.
- **Invalidation fan-out** — table every mutation → which query keys it invalidates → which queries refetch. Flag mutations that refetch several whole datasets. Prefer targeted cache updates (`setQueryData`/optimistic updates) over broad invalidation for high-frequency mutations.
- **High-frequency interaction paths** — drag-drop reorder, toggles, checkbox ticks: count calls + refetches *per user interaction* and estimate billed reads/writes at realistic data volumes. These paths dominate cost; batch/debounce them and update caches locally.
- **Overlapping fetches** — count how many views independently fetch the same underlying data (each old server endpoint naively becomes its own collection fetch). Consolidate into shared base queries with client-side derivation/selectors, or real-time listeners that bill deltas only.
- **N+1 and multi-query endpoints** — server code that runs several queries per request becomes several round trips client-side; plan to denormalize/embed or fetch-once-derive-many.
- **Over-fetching** — payloads returning data the view discards (archived/done records, unused fields); on billed reads, filter at the query or restructure.
- **Getconce vs listen** — decide per collection: repeated one-shot reads vs a listener (listeners bill initial read + deltas; repeated full fetches bill everything every time). Base the choice on measured refetch frequency from this audit, not on defaults.

Output of this step: a findings table (pattern → current cost → post-migration cost at target pricing → fix), and a **pre-migration refactor phase** in the plan for the fixes worth doing on the old stack first (they're testable there while everything still works).

## Step 4 — Identify hard translation points

Explicitly list what does NOT map 1:1 to the target. Common ones:
- Server-computed responses (joins, grouping, aggregates, derived reports) → move to client-side derive functions (if data is small) or server functions
- Complex WHERE / OR logic the target's query language can't express
- Multi-step writes needing transactions → target's transaction/batch equivalent
- Cascade deletes, soft deletes, uniqueness constraints not enforced by the target
- ID type changes (numeric ↔ string) — the ripple through frontend types is usually the largest mechanical change
- Ordering schemes (fractional/REAL order columns, rowid fallbacks)

## Step 5 — Design (Plan agent)

Give a Plan agent the full exploration + efficiency-audit findings + user decisions. Require these standard design decisions in its output:

- **Field-shape strategy**: keep existing field names/types verbatim in the new store where possible — minimizes type churn; only change what must change (usually IDs).
- **ID strategy**: preserve existing IDs (e.g. numeric → string doc IDs) so foreign-key fields survive without a mapping table; new records use the target's native IDs.
- **Data model mapping table**: old table → new location, with embed-vs-reference decisions for 1:1 and small child data.
- **Security model**: rules/policies matching the tenancy decision from Step 1.
- **Data-layer swap strategy**: keep the API-client surface identical (drop-in replacement module) so hooks/components change minimally.

## Step 6 — Write the plan document

Structure (every plan should have all of these):

1. **Context** — why, current state summary, confirmed user decisions, key facts (volume, auth state)
2. **Guiding design decisions** — numbered, locked in up front
3. **Phases** — each independently verifiable, ordered so **the old system keeps running until the last phase**:
   - Pre-migration efficiency refactor (from Step 3) — fix invalidation fan-out, batch high-frequency writes, consolidate overlapping fetches, on the old stack where it's testable
   - Setup + auth (app still fully functional on old stack)
   - New data model + security rules (+ rules tests)
   - One-off data migration script — idempotent, reads old store read-only, **built-in verification** (counts + field-level spot checks, hard-fail on mismatch), tested against emulator/staging first. If the project has a backup skill (Step 0), run it immediately before this phase and before production cutover; also commit any pending/uncommitted schema migrations first so exported data is complete
   - Frontend/data-layer swap (drop-in client, derive functions with fixture unit tests)
   - Server-side functions for anything with secrets — follow the project's AI/API rules file if one exists (prompt storage, rate limiting, error-shape conventions)
   - **Decommission last** — delete old stack only after days of clean production use; keep the old database file/dump as the permanent rollback artifact. Include updating CLAUDE.md, `.claude/rules/`, and any setup docs so they describe the new architecture — stale rules files will misdirect every future task
4. **Risks / gotchas** — always check: billing-plan requirements of the target, secrets never in client env vars, ID-type ripple, timezone shifts when logic moves server→client, offline/caching behavior, test-suite impact (mocking the new SDK)
5. **Cost estimate** — expected reads/writes per day at realistic usage (from the Step 3 audit) against the target's pricing/free tier, plus a budget-alert step
6. **Verification** — per-phase checks plus an end-to-end cutover checklist

## Step 7 — Save and present

- Save to `_docs/` (or equivalent) as `<target>-migration-plan.md`
- Present a summary of the phases and get user sign-off before any implementation begins
