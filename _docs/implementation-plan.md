# Implementation Plan — MSD VD2 Scope Map

Build sequence for the app specified in [`_docs/PRD.md`](PRD.md).

This plan follows the structure of the [`/setup-site`](../.claude/skills/setup-site/SKILL.md)
skill: **sequential phases, each ending in a verification gate, and never start a new phase
until the current one is confirmed working.** Phases 0–5 of `setup-site` are already complete
and form the foundation ([§Phase 0](#phase-0--preflight)); this plan picks up where it stops.

Like that skill, this document defines **only the sequence and the gates**. Implementation
detail lives in the rules files — `rules-react-shadcn-tailwind.md` is the source of truth for
structure and patterns, `rules-database.md` for data work, `rules-css-bem.md` for component
CSS, `rules-design-tokens.md` for tokens. Where this plan conflicts with a rules file, the
rules file wins.

**Requirement IDs** (`R-7.1`, `R-9.4`, …) refer to [`_docs/PRD.md`](PRD.md).

---

## How each phase runs

1. Build only what the phase lists. No extra features, abstractions, or dependencies.
2. Run the phase's verification checklist.
3. **Stop. Present the checklist and wait for confirmation.**
4. On confirmation, commit that phase as one reviewable commit, then start the next:

```bash
git status --short          # never commit .env, *.db, node_modules, dist, *.tsbuildinfo
git add -A
git commit -m "Phase <N>: <what the phase built>"
git push
```

A failed push is reported and does not block the build. Do not commit mid-phase, and do not
commit a phase that has not been confirmed.

Every phase gate ends with these three, in addition to its own checks:

```bash
npm run test && npm run lint && npm run build
```

---

## Phase 0 — Preflight

### Foundation already in place

`setup-site` Steps 1–5 are complete and verified in this repo. Step 6 (Anthropic API) is
**skipped** — the PRD specifies no AI features.

| setup-site step | State |
|---|---|
| 1 — Vite + React + Express, aliases, `npm run dev` | ✅ `vite.config.ts` with `/api` + `/uploads` proxy |
| 2 — Tailwind v4 + Shadcn, tokens, dark mode | ✅ `src/globals.css`, 8 `ui/` primitives, `ThemeToggle` |
| 3 — Express + SQLite, migrations, repositories | ✅ `server/database.ts`, `migrate.ts`, `001_create_notes.sql`, backup script |
| 4 — Router v7, TanStack Query, api-client, hooks | ✅ `src/routes/index.tsx`, `useNotes.ts`, `api-client.ts` |
| 5 — Vitest, RTL, ESLint | ✅ 5 tests passing, lint clean, build clean |
| 6 — Anthropic API | ⏭️ Skipped — not required |

Confirmed at the start of this plan: `npm run test` 5/5 pass · `npm run lint` clean ·
`npm run build` clean.

### Tasks

1. **Back up the database** before any schema work — `/backup-db`.
2. **Add the one missing dependency:** `zod` (shared validators, `R-9.3`). Nothing else is
   needed — the map uses inline SVG over CSS grid, so no graph or charting library.
3. **Confirm the source documents are present and unmodified** — the parsers in Phase 1 are
   written against them:
   - `_docs/pwc-scope-to-mvp-mapping.md`
   - `_docs/R1-sequenced-release-capabilities-table.md`
4. **Settle the open decisions that block Phase 1 and 2.** [PRD §15](PRD.md#15-open-decisions)
   lists six. Two must be answered before the parsers are written, because they change the
   import output:
   - **D-1 — how Release 1.9 is represented.** Recommendation in the PRD is to keep it and
     record the decomposition. Affects the `releases` seed and every conflict row.
   - **D-3 — are bare `938`/`946` separate from their Option 1A records?** Affects whether
     `mvp_features` holds 51 records or 49.

   D-2 (epic ref `186` duplicated), D-4 (near-duplicate capabilities), D-5 (keep markdown
   export) and D-6 (`CLAUDE.md`) can be answered later. D-6 is already resolved —
   `CLAUDE.md` has been rewritten as pure task routing.

### Gate

```
Phase 0 verification:
- [ ] /backup-db has written a timestamped snapshot into server/backups/
- [ ] `zod` installed and in package.json dependencies
- [ ] Both source documents present in _docs/
- [ ] D-1 and D-3 answered
- [ ] npm run test && npm run lint && npm run build all pass

Reply "done" when all pass, or describe any issues.
```

---

## Phase 1 — Parsers

**The highest-risk work in the app, and the reason it goes first.** Until the counts come out
exact, nothing downstream is trustworthy. No database, no UI, no Express — pure functions and
tests only.

Rules: `rules-react-shadcn-tailwind.md` → Testing.

### Build

- `server/services/mapping-parser.ts` — parses `pwc-scope-to-mvp-mapping.md` into typed
  releases, phases, features, assumptions, MVP feature records and capability links.
- `server/services/sequencing-parser.ts` — parses the release × phase markdown table into
  positioned capabilities.
- `server/services/phase-canon.ts` — the 7 canonical phases from
  [PRD §4](PRD.md#4-canonical-phases) with epic refs, plus the normalisation that folds
  *Onboarding via invite* into *Access & Onboarding* and records `source_phase_label`.
- `server/services/reconcile.ts` — merges the two parser outputs, emits the union model and
  the conflict list (`R-7.1`).
- Fixtures in `server/services/__fixtures__/` — small hand-written markdown covering each
  hazard in [PRD §11](PRD.md#11-import), not copies of the full documents.
- Tests for every hazard, each as its own case:
  - inconsistent bullet formatting (mapping lines 90 and 668)
  - `(Option 1A)` / `(Option 1B)` suffix stripping into `scope_option`
  - case-variant capability text (`Filter and Sort Applications`)
  - near-duplicate capability text (refs 941, 956) — **not** merged
  - `<br>`-joined table cells, literal `-` empty cells, bolded release labels
  - phase-name casing differences between the two documents
  - anchored `(actor, ref)` regex — `&`, `/`, `,`, em-dashes and apostrophes inside names
  - a malformed line raises an error naming the source line number (`R-11.2`)

### Gate

The reconciliation counts are the gate. Run the parsers over the **real** documents and print
the summary — any drift is a bug, not a tolerance.

```
Phase 1 verification:
- [ ] Parsers run over both real documents and print a reconciliation summary
- [ ] Counts are exactly:  6 releases · 7 canonical phases · 48 PwC features ·
      92 assumptions · 48 MVP refs / 51 MVP records · 107 distinct capabilities ·
      60 feature→MVP links · 123 feature→capability links
- [ ] Conflicts detected: 35 release conflicts, 21 phase conflicts, 2 unmatched links
- [ ] Release conflict breakdown matches PRD §7:
      1.9→2 = 16 · 1.9→1.1 = 11 · 1.9→1.4 = 5 · 1.3→1.2 = 2 · 1.1→1.4 = 1
- [ ] A deliberately corrupted fixture line fails with an error naming the line number
- [ ] Every hazard in PRD §11 has a named test case
- [ ] npm run test && npm run lint && npm run build all pass

Reply "done" when all pass, or describe any issues.
```

---

## Phase 2 — Schema, import, and the graph endpoint

Rules: `rules-database.md` → **Database change** and **Database setup → Repository per entity**.

### Build

- **Migration `002_create_scope_schema.sql`** — `releases`, `phases`, `pwc_features`,
  `assumptions`, `mvp_features`, `capabilities`, `pwc_feature_mvp_features`,
  `pwc_feature_capabilities`. Per [PRD §6](PRD.md#6-data-model):
  - `mvp_features` unique on `(ref, scope_option)`
  - `pwc_feature_capabilities` carries the conflict columns — `release_conflict`,
    `phase_conflict`, `resolution_state`, `resolution_note`, `resolved_at` (`R-7.2`)
  - every table carries `source`, `created_at`, `updated_at` (`R-9.9`)
  - `ON DELETE CASCADE` on `assumptions` and both join tables; **not** on features,
    releases, phases or MVP features (`R-9.4`)
  - idempotent — `CREATE TABLE IF NOT EXISTS`
- **Migration `003_drop_notes.sql`** — drops the `notes` table. `001_create_notes.sql` is
  already applied and must **not** be edited (`rules-database.md`).
- **Remove the notes scaffold** — `notes-repository.ts`, `routes/notes.ts`, `useNotes.ts`,
  its test, and its wiring in `server.ts` and `Home.tsx`. It was `setup-site`'s verification
  vehicle and `/api/scope` replaces it.
- **Repositories**, one per entity in `server/repositories/`, lazy `??=` prepared statements,
  no SQL outside them.
- **`server/services/importer.ts`** — runs the Phase 1 reconciler and writes the result
  inside a single `db.transaction(fn)()`. Additive and non-destructive on re-run: never
  overwrites a row whose `source` is `manual` or whose conflict is resolved (`R-11.4`).
- **`POST /api/import`** — explicit action, not automatic on boot after the first run.
- **`GET /api/scope`** — the whole graph in one payload (`R-10.7`).
- Boot logs the reconciliation summary and fails the check on drift (`R-11.3`).
- `src/lib/api-client.ts` + `src/hooks/useScope.ts` — one TanStack Query hook for the graph.

### Gate

```
Phase 2 verification:
- [ ] npm run server starts clean; migrations 002 and 003 apply, then log
      "Migrations up to date" on restart
- [ ] POST /api/import populates the database and logs the Phase 1 counts
- [ ] GET /api/scope returns the full graph in one response
- [ ] Re-running POST /api/import changes nothing (idempotent)
- [ ] Manually edit one row, set source='manual', re-import — the edit survives
- [ ] The notes feature is gone: no /api/notes route, no useNotes, no UI remnant
- [ ] Repository tests run against better-sqlite3 :memory: and cover the
      unique (ref, scope_option) constraint and cascade behaviour
- [ ] An invalid request returns 4xx and the server is still alive afterwards
- [ ] npm run test && npm run lint && npm run build all pass

Reply "done" when all pass, or describe any issues.
```

---

## Phase 3 — Static scope map

The walking skeleton is complete at the end of this phase: real data, rendered, on screen.
No filtering, no editing, no edges yet.

Rules: `rules-layout-elements.md` for the page · `rules-css-bem.md` for the components ·
`rules-design-tokens.md` for the new tokens.

### Build

- `src/pages/ScopeMap.tsx` at `/`, registered in `src/routes/index.tsx`, lazy-loaded.
  Route opts into fluid width (`handle: { fluid: true }`) — the grid needs it.
- CSS-grid layout: **releases on X** (1.1 → 1.2 → 1.3 → 1.4 → 1.9 → 2), **canonical phases
  on Y** (rows 1–7). Tailwind utilities for the grid itself (page-level layout).
- Empty cells render as faint placeholders — an empty cell is information (`R-8.1`).
- BEM components with their own CSS files, imported in `globals.css`:
  - `FeatureCard` — ID, name, MVP chips with `1A`/`1B`, actor summary (`R-8.1`)
  - `ScopeMapGrid` — the cell scaffold and axis headers
- **New tokens in `@theme`** — release colours and actor colours. The current palette is the
  stock neutral Shadcn ramp with no semantic hues, so these are additions. Derive them as
  tokens; never hardcode in a BEM file. Flag for replacement when a design system arrives.
- Zoom-to-fit control; the full map legible at 1440px (`R-8.7`).
- Release 1.4 and 2 columns render even though they have no features — they have
  capabilities (`R-8.5`).

### Gate

```
Phase 3 verification:
- [ ] / renders a 6-column × 7-row grid from real imported data
- [ ] Feature counts per cell match PRD §4:
      Access & Onboarding 6/·/·/6 · Employer Profile & Portal 4/·/·/6 ·
      Manage Vacancies 10/1/·/· · Document Management ·/2/·/· ·
      Applications & Referrals ·/2/·/· · Employer Recruitment ·/2/3/· ·
      Outcomes & Support ·/1/2/3   (columns 1.1/1.2/1.3/1.9)
- [ ] 48 feature cards total; 13 of 28 feature cells populated
- [ ] Phases appear in canonical order 1–7 with their epic refs
- [ ] Release 1.4 and 2 columns are present and visibly empty of features
- [ ] Empty cells are visible as placeholders, not collapsed
- [ ] Whole map legible at 1440px; zoom-to-fit works
- [ ] Dark mode renders correctly; no hardcoded colours in the BEM files
- [ ] npm run test && npm run lint && npm run build all pass

Reply "done" when all pass, or describe any issues.
```

---

## Phase 4 — Filter rail and URL state

Rules: `rules-css-bem.md` · `rules-react-shadcn-tailwind.md` → Routing.

### Build

- `FilterRail` BEM component — persistent, always visible, never a modal (`R-8.8`).
- Seven filter groups: Release (6), Phase (7), Actor (4), MVP feature (48, searchable),
  Scope option (1A / 1B / unspecified), Conflict state, Source.
- Compose AND across groups, OR within a group. Live result count per control (`R-8.9`).
- **URL search params are the single source of truth** for filter state (`R-10.2`) — read and
  written via React Router, not component state mirrored into the URL.
- Single visible "clear all".
- Zero-result state names the responsible filter and offers to drop it (`R-8.10`).
- All filtering client-side over the single graph payload — no refetch, no spinner (`R-10.7`).

### Gate

```
Phase 4 verification:
- [ ] Filtering to release 1.1 leaves 20 features; 1.2 → 8; 1.3 → 5; 1.9 → 15
- [ ] Filtering by actor=jobseeker shows no features in release 1.1
- [ ] Filtering by MVP ref 947 leaves exactly 4 features
- [ ] Filtering by scope option 1B leaves only F-009 and F-010
- [ ] Every active filter appears in the URL; pasting the URL in a new tab
      reproduces the identical view
- [ ] Browser back/forward steps through filter states
- [ ] A zero-result combination names the filter that caused it
- [ ] No loading spinner and no layout thrash on any filter change
- [ ] npm run test && npm run lint && npm run build all pass

Reply "done" when all pass, or describe any issues.
```

---

## Phase 5 — Feature detail panel (read-only)

Rules: `rules-css-bem.md`.

### Build

- `FeatureDetailPanel` BEM component — opens **beside** the map, never over it, never as a
  route change that loses map state (`R-8.14`).
- Content: ID, name, release, phase with epic ref, foundational-build statement, assumptions
  in source order, MVP features with scope option, capabilities grouped by actor with each
  capability's own release × phase.
- **Where a capability's placement differs from its feature's, show both inline** — the most
  useful thing on the panel (`R-8.15`).
- MVP chips pivot the map to that MVP feature without closing the panel (`R-8.16`).
- "Connected features" list, flagging release-crossing connections (`R-8.17`).
- Features with no capabilities (F-008, F-029) state the source's own qualifier rather than
  rendering an empty section (`R-8.18`).
- Selection reflected in the URL (`R-10.2`).

### Gate

```
Phase 5 verification:
- [ ] Clicking a card opens the panel; the map stays visible and keeps its filters
- [ ] F-014 shows its T&Cs capability flagged as sitting in release 1.4, not 1.1
- [ ] F-008 and F-029 state the source's qualifier, not an empty section
- [ ] F-050 shows its assumption list in source order
- [ ] Clicking the 947 chip on F-045 pivots the map without closing the panel
- [ ] F-003's connected-features list flags 938 as crossing a release boundary
- [ ] Selected feature appears in the URL and reloads from it
- [ ] Escape closes the panel; the panel is fully keyboard reachable
- [ ] npm run test && npm run lint && npm run build all pass

Reply "done" when all pass, or describe any issues.
```

---

## Phase 6 — CRUD pattern: `pwc_features` end-to-end

The largest area in the PRD, so **one entity goes end-to-end first as the pattern** the rest
copy. Do not start Phase 7 until this pattern is confirmed.

Rules: `rules-database.md` → **Database change** (migration → repository → route →
api-client → hook → invalidate).

### Build

- `src/lib/validators.ts` — Zod schema for `pwc_features`, used by **both** the form and the
  route handler (`R-9.3`). Enforces `F-\d{3}`, uniqueness, and required release + phase.
- REST routes: `POST` / `PATCH` / `DELETE /api/features/:id`. Never `throw` in an async
  handler — `next(err); return` (`rules-database.md`).
- Referential-integrity guard: deleting a feature with dependents is refused with a message
  naming what depends on it and how many; cascade is a separate, explicitly confirmed action
  (`R-9.4`, `R-9.5`).
- Inline edit affordances in the detail panel (`R-8.19`) plus a create form.
- Create from a map cell pre-fills that release and phase (`R-9.7`).
- Next free `F-` number offered as an overridable default ([PRD §6](PRD.md#6-data-model)).
- TanStack Query `useMutation` with optimistic update and real rollback on error, surfacing
  the server's message (`R-9.6`).
- Unsaved-change protection on navigation (`R-10.8`).

### Gate

```
Phase 6 verification:
- [ ] Create a feature from a map cell — release and phase pre-filled; it appears in the grid
- [ ] Suggested F- number is the next free one and can be overridden
- [ ] Edit a feature name inline in the panel; the card updates
- [ ] Duplicate F- id is rejected by the SERVER (test with curl, not just the form)
- [ ] A feature with no release or phase is rejected
- [ ] Deleting a feature with assumptions and MVP links is refused with a message
      naming the counts; the explicit cascade action then succeeds
- [ ] Deleting a feature removes its assumptions and join rows, nothing else
- [ ] Force a server error — the optimistic update rolls back and the message shows
- [ ] Navigating away from a dirty form warns first
- [ ] source='manual', created_at and updated_at set correctly on a created row
- [ ] npm run test && npm run lint && npm run build all pass

Reply "done" when all pass, or describe any issues.
```

---

## Phase 7 — CRUD for the remaining entities

Repeat the confirmed Phase 6 pattern. No new patterns invented here.

### Build

- Full CRUD for `releases`, `phases`, `assumptions`, `mvp_features`, `capabilities`, and both
  join tables (`R-9.1`).
- Zod schema per entity, shared between form and handler:
  - `mvp_features` unique on `(ref, scope_option)`; `scope_option` ∈ `1A` | `1B` | `null`
  - `capabilities.actor` ∈ the four known actors; requires release + phase
  - `assumptions.position` contiguous per feature after insert, delete or reorder
  - `phases.display_order` contiguous 1–n
- `/manage/:entity` admin list pages for bulk work and for entities with no natural home on
  the map (`R-9.2`).
- Reorder controls with explicit move-up / move-down, not drag-only (`R-9.8`).
- Reorder and cascade run inside `db.transaction(fn)()`.

### Gate

```
Phase 7 verification:
- [ ] Every entity is creatable, editable and deletable from the UI
- [ ] Creating MVP ref 951 with scope_option 1A is rejected as a duplicate
- [ ] Creating MVP ref 951 with no option is accepted (distinct record)
- [ ] A capability with an unknown actor is rejected by the server
- [ ] Deleting assumption 2 of 4 leaves positions contiguous 1-2-3
- [ ] Move-up / move-down reorder assumptions and phases without drag
- [ ] Reordering phases keeps display_order contiguous 1-7
- [ ] Deleting MVP ref 947 is refused naming 4 features and 6 capabilities
- [ ] A failed multi-step reorder rolls back completely
- [ ] npm run test && npm run lint && npm run build all pass

Reply "done" when all pass, or describe any issues.
```

---

## Phase 8 — Connection edges

The feature that makes it a scope *map* rather than a filtered list.

### Build

- SVG overlay above the CSS-grid card layout — no graph library (`rules` / PRD §12).
- Edges between cards sharing an MVP feature, labelled with the shared ref (`R-8.2`).
- **Off by default**; revealed on hover or select. 60 links at once is noise.
- Passive connection-density indicator per card (`R-8.3`).
- Cross-release edges render distinctly from within-release edges (`R-8.4`).
- Reachable by click and by keyboard, not hover alone (`R-10.3`).

### Gate

```
Phase 8 verification:
- [ ] Edges are hidden by default
- [ ] Selecting F-045 draws 3 edges to F-039, F-050, F-051, each labelled 947
- [ ] F-003 → F-001/F-002 via 938 renders as a cross-release edge, visibly distinct
- [ ] Density indicator ranks the 947 cluster above single-link features
- [ ] Edges are reachable by keyboard, not hover only
- [ ] Edges track correctly after filtering, zooming and panning
- [ ] Edge colours come from tokens; distinguishable without relying on hue alone
- [ ] npm run test && npm run lint && npm run build all pass

Reply "done" when all pass, or describe any issues.
```

---

## Phase 9 — Reconciliation view

The work queue for the source conflicts — the questions neither document can answer today.

### Build

- `/reconciliation` route, lazy-loaded ([PRD §8.5](PRD.md#85-reconciliation-view-reconciliation)).
- Conflicts grouped by type, both placements side by side.
- Resolution state set inline: `unreviewed` | `mapping_wins` | `table_wins` | `both_correct` |
  `defect_raised`, with a note (`R-7.2`, `R-7.3`).
- Filter by resolution state so the unreviewed set visibly shrinks.
- `ConflictBadge` BEM component; features and capabilities with an unreviewed conflict badged
  on the map (`R-7.4`).
- Release 1.9's decomposition across table releases 1.1 / 1.4 / 2 shown explicitly (D-1).
- The 2 unmatched links (F-050, F-051 → 947) listed for human confirmation — never merged on
  a prefix match ([PRD §7](PRD.md#7-the-two-sources-disagree)).

### Gate

```
Phase 9 verification:
- [ ] 35 release conflicts and 10 remaining phase conflicts listed
      (11 of the original 21 resolved by the canonical phase merge)
- [ ] The 1.1 → 1.4 T&Cs conflict on F-014 is present and readable
- [ ] Release 1.9's decomposition into 1.1 (11) / 1.4 (5) / 2 (16) is shown
- [ ] Setting a resolution state persists and survives a reload
- [ ] Resolved conflicts drop out of the unreviewed filter
- [ ] Conflict badges appear on the affected cards on the map
- [ ] A resolved conflict is not overwritten by POST /api/import
- [ ] The 2 unmatched 947 links are listed, not silently merged
- [ ] npm run test && npm run lint && npm run build all pass

Reply "done" when all pass, or describe any issues.
```

---

## Phase 10 — Search

### Build

- One always-reachable field; `/` focuses it (`R-10.4`).
- Matches feature ID, feature name, foundational-build text, MVP ref and title, capability
  text, assumption text, epic ref (`R-8.11`).
- Results grouped by what matched (`R-8.12`).
- Keyboard-navigable; Enter selects and reveals the feature on the map (`R-8.13`).
- Match term highlighted in the detail panel on arrival.

### Gate

```
Phase 10 verification:
- [ ] "F-035" finds Create vacancy
- [ ] "Omniscript" finds F-038 via its assumption text, grouped as an assumption match
- [ ] "947" finds the MVP feature and its 4 referencing features
- [ ] "179" finds Access & Onboarding via its epic ref
- [ ] Results are grouped by match type
- [ ] / focuses search; arrows and Enter work without the mouse
- [ ] Enter reveals the feature on the map with the term highlighted in the panel
- [ ] npm run test && npm run lint && npm run build all pass

Reply "done" when all pass, or describe any issues.
```

---

## Phase 11 — Coverage view

### Build

- `/coverage` route, lazy-loaded.
- MVP features ranked by referencing feature count (`R-8.20`).
- MVP features spanning more than one release, called out (`R-8.21`).
- Orphans both directions: MVP features with no capabilities (`937`, `953`); the 9 table-only
  refs with no PwC feature; features with no capabilities (F-008, F-029) (`R-8.22`).
- Counts per release and per cell (`R-8.23`).
- Actor breakdown per release (`R-8.24`).
- Near-duplicate capabilities (refs 941, 956) flagged for human resolution (D-4).

### Gate

```
Phase 11 verification:
- [ ] Ranking shows 947 = 4; then 938, 951, 969, 990 = 3; then 10 refs at 2
- [ ] Cross-release MVP features listed: 938 (1.1, 1.9), 951 (1.1, 1.9), 972 (1.2, 1.3)
- [ ] Orphans listed: 937 and 953 with no capabilities; the 9 table-only refs
      (950, 957, 959, 973, 976, 986, 989, 992, 993); F-008 and F-029
- [ ] Actor breakdown shows jobseeker capabilities starting only at release 1.2
- [ ] Near-duplicate capabilities under refs 941 and 956 are flagged
- [ ] Counts agree with the map and with Phase 1's reconciliation summary
- [ ] npm run test && npm run lint && npm run build all pass

Reply "done" when all pass, or describe any issues.
```

---

## Phase 12 — Markdown export

**Cut this phase if D-5 is answered "no".** It is an addition to the original brief — see
[PRD §9 R-9.11](PRD.md#9-crud-and-forms).

### Build

- `GET /api/export/mapping.md` and `GET /api/export/sequencing.md` — regenerate both source
  documents from the database in their original format.
- A round-trip test: export → re-import → identical database.

### Gate

```
Phase 12 verification:
- [ ] Both endpoints return valid markdown in the original document format
- [ ] Export of an unmodified database diffs cleanly against the source files
      (modulo the canonical phase merge, which must be documented in the output)
- [ ] Round-trip: export → wipe → re-import produces identical row counts and content
- [ ] A manually created feature appears in the exported markdown
- [ ] npm run test && npm run lint && npm run build all pass

Reply "done" when all pass, or describe any issues.
```

---

## Phase 13 — Responsive fallback, accessibility, final QA

### Build

- Tablet fallback below `md`: release-grouped accordion with the same filters, detail panel
  and edit affordances. The map is a desktop affordance; the data and the editing are not
  (`R-10.5`).
- Accessibility pass (`R-10.6`, `CLAUDE.md` → WCAG 2.1 AA): release, actor and conflict state
  encoded by more than hue; visible focus throughout; form errors never colour-only; correct
  semantics on the grid and the panel.
- Breakpoints from the four `--breakpoint-*` tokens only — no arbitrary widths
  (`rules-css-bem.md` §9).
- Run the `qa-tester` agent against [`_docs/PRD.md`](PRD.md), then a second pass in
  **re-review mode** to confirm no test was weakened to get a green run
  (`CLAUDE.md` → QA workflow).

### Gate

```
Phase 13 verification:
- [ ] Below md the accordion fallback renders; filters, detail and editing all work
- [ ] No horizontal page scroll at any breakpoint
- [ ] Full keyboard path: / search → arrows → Enter → edit → save → Escape
- [ ] Visible focus on every interactive element
- [ ] Release, actor and conflict state distinguishable without colour
- [ ] Contrast meets WCAG AA in both light and dark
- [ ] qa-tester has reviewed against the PRD and recorded _docs/qa-scenarios.md
- [ ] qa-tester re-review confirms no test was weakened
- [ ] All PRD §13 success criteria met
- [ ] npm run test && npm run lint && npm run build all pass

Reply "done" when all pass, or describe any issues.
```

---

## Sequence summary

| Phase | Builds | Gated on |
|---|---|---|
| 0 | Preflight, backup, `zod`, D-1 + D-3 answered | Foundation green |
| 1 | Both parsers + reconciler + fixtures | Exact counts and conflict breakdown |
| 2 | Schema, import, `GET /api/scope`, notes removed | Idempotent import, re-import safety |
| 3 | Static map grid — **walking skeleton complete** | Cell counts match PRD §4 |
| 4 | Filter rail + URL state | Filter counts, URL round-trip |
| 5 | Detail panel (read-only) | Conflict shown inline on F-014 |
| 6 | CRUD pattern — `pwc_features` end-to-end | Server-side validation, delete guard |
| 7 | CRUD — all remaining entities | Constraints, contiguous ordering, rollback |
| 8 | Connection edges | 947 cluster, cross-release edges |
| 9 | Reconciliation view | 35 + 10 conflicts, resolution persists |
| 10 | Search | Assumption-text and epic-ref matches |
| 11 | Coverage view | Ranking and orphans both directions |
| 12 | Markdown export *(cuttable — D-5)* | Round-trip identical |
| 13 | Responsive, a11y, QA | qa-tester re-review clean |

Phases 1–3 are the walking skeleton and should be demonstrable before anything else starts.
Phase 6 is the pattern for Phase 7 — do not run them together.
