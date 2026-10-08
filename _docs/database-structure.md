# Database structure

**Firestore**, project `vd2-scope`. Everything lives under
`users/{owner UID}/`, one collection per former SQLite table, and the browser
reads and writes it directly — `firestore.rules` allows the pinned owner UID
and nobody else. How reads and writes work: `.claude/rules/rules-firebase.md`.

Field shapes are the SQLite rows verbatim — snake_case, `0`/`1` flags, numeric
ids, UTC timestamps as `YYYY-MM-DD HH:MM:SS` strings, `null` for "no value".
Every document carries `created_at` and `updated_at`.

> Until 2026-10-09 this was SQLite (`better-sqlite3`, migrations in
> `server/migrations/`). The final SQLite database is kept in
> `backups/sqlite/msd-vd2-scope-final-pre-firestore.db`.

## What SQLite enforced, and where it lives now

The store has no foreign keys, unique indexes or CHECK constraints. Each was
re-implemented where the writes happen, and is tested
(`src/lib/scope-invariants.test.ts`, `admin/import/plan-import.invariants.test.ts`):

| Was | Now |
|---|---|
| `FOREIGN KEY` (feature → release/phase, capability → release/phase/MVP record, links → feature/capability/MVP record) | App writes: the planners refuse a placement that doesn't exist (422). Re-import: `assertReferencesResolve` refuses the whole import |
| `ON DELETE CASCADE` (links with their feature or capability) | The delete planners remove the link documents themselves, tombstoned ones included, after the two-step cascade confirmation |
| `CHECK (id GLOB 'F-[0-9][0-9][0-9]')` | `FEATURE_ID_PATTERN` in the zod schema; the import checks it too |
| `UNIQUE` on (`ref`, option), (`mvp_ref`, `LOWER(text)`), (feature, capability) | The create/update planners refuse a duplicate (409) |
| `CHECK` on `actor`, `scope_option`, `resolution_state`, `source` | zod enums in `src/lib/validators.ts` |
| `AUTOINCREMENT` | `meta/sequences` — counter + 1 inside the write's transaction; a deleted id is never reused |

## Collections

Document ids are the row's primary key as a string (`docId` in
`src/lib/scope-records.ts`).

### `releases` — doc id = `id`
| Field | Notes |
|---|---|
| `id` | `1.1`, `1.4`, `2` — the id both sources use |
| `label`, `name`, `description` | `label` is what the UI shows ("Package 1.1") |
| `display_order` | Column order on the map |
| `in_mapping_source`, `in_sequencing_source` | 0/1 — which documents name it |
| `source` | `mapping` / `sequencing` / `both` / `manual` — `manual` once edited in the app; re-import then leaves it alone |

### `phases` — doc id = `id`
| Field | Notes |
|---|---|
| `id` | Canonical kebab-case id (`manage-vacancies`) |
| `name`, `epic_ref`, `epic_description` | `epic_ref` is deliberately not unique — epic 186 sits on two phases (D-2) |
| `display_order` | Row order; renumbered 1..n on every move |
| `source` | As releases |

### `pwc_features` — doc id = `id`
| Field | Notes |
|---|---|
| `id` | `F-nnn`. Sparse by design — gaps carry no meaning (PRD §6) |
| `name`, `foundational_build` | |
| `release_id`, `phase_id` | Required: a feature with no placement cannot be drawn (R-9.3) |
| `source_phase_label` | The label as the mapping document wrote it — what phase conflicts are measured on |
| `capability_note`, `question` | Free text / a raised question, nullable |
| `notes` | The source's assumptions as a numbered markdown list, until edited |
| `notes_edited` | 0/1 — set by an edit to `notes`; re-import then leaves the notes alone without freezing the rest of the row |
| `display_order`, `source` | |

### `mvp_features` — doc id = `String(id)`
| Field | Notes |
|---|---|
| `id` | From `meta/sequences.mvp_features` |
| `ref`, `scope_option` | Identity is (`ref`, option): `1A` and `1B` are separate records; `null` is the option-agnostic "bare" record. Uniqueness compares a `null` option as `''` — two bare records for one ref are a duplicate |
| `title` | |
| `release_id`, `phase_id` | A **stated** placement, nullable. Setting one moves every capability the record owns |
| `question`, `details` | `details` is a reader's note. Nothing imports into it, so it needs no `*_edited` flag, and editing it does not mark the record manual — which would freeze its title and placement against re-import |
| `source` | |

### `capabilities` — doc id = `String(id)`
| Field | Notes |
|---|---|
| `id` | From `meta/sequences.capabilities` |
| `mvp_feature_id` | The owning record, nullable. Chosen by rule when a ref has several records, then `mvp_owner_ambiguous` = 1 (D-3) |
| `mvp_ref` | The ref the source cited — kept so re-import still recognises the row after it is re-owned |
| `text`, `actor` | Identity is (`mvp_ref`, ASCII-lowercased `text`). `actor` ∈ employer / staff / jobseeker / system |
| `source_text` | The wording the source document used. Re-import matches on it, so a capability renamed in the app is updated, not duplicated. Hidden from the UI |
| `release_id`, `phase_id`, `source_phase_label` | Nullable — an unmatched mapping-only capability has no placement. A hand move sets the label to the phase's name |
| `question`, `source` | A question is an annotation; it does not mark the row manual |

### `pwc_feature_mvp_features` — doc id = `{pwc_feature_id}__{mvp_feature_id}`
| Field | Notes |
|---|---|
| `pwc_feature_id`, `mvp_feature_id` | |
| `source` | |
| `removed_at` | **Tombstone.** Set when the link is removed in the app; the link is hidden but kept, so re-import cannot put it back (R-9.10). Re-adding clears it |

### `pwc_feature_capabilities` — doc id = `String(id)`
A feature citing a capability, and the conflict between where each source puts them.

| Field | Notes |
|---|---|
| `id` | From `meta/sequences.pwc_feature_capabilities` |
| `pwc_feature_id`, `capability_id` | One document per pair |
| `source_citations` | F-079 cites both casings of ref 980 — one edge, 2 citations; the total still reconciles to the parsed links |
| `matched` | 0 when the mapping cites text the table has no exact match for (never merged on a prefix, PRD §7) |
| `release_conflict`, `phase_conflict`, `phase_conflict_merged` | 0/1. Recomputed whenever the feature or the capability moves (`src/lib/conflict-rules.ts`) |
| `feature_release_id`, `capability_release_id`, `feature_phase_label`, `capability_phase_label` | Both placements, recorded only while they disagree (R-7.1) |
| `resolution_state`, `resolution_note`, `resolved_at` | `unreviewed` / `mapping_wins` / `table_wins` / `both_correct` / `defect_raised`. Re-import never overwrites a decision |
| `source`, `removed_at` | `removed_at` is a tombstone, as above |

### `meta/sequences`
`{ mvp_features, capabilities, pwc_feature_capabilities }` — the last id handed
out for each. Seeded from SQLite's `sqlite_sequence`, which ran ahead of the
data (SQLite's UPSERT spent a number on every re-saved link).

## Import

`/import-scope` → `admin/import-scope.ts` → `admin/import/plan-import.ts`
parses both markdown documents in `_docs/`, reconciles them, and plans the
writes against the current store; `--apply` commits and verifies.

- **Drift fails before any write.** Reconciled counts are checked against the
  expected figures first (R-11.3); so are ids and references.
- **Re-import is additive (R-11.4).** A row whose `source` is `manual`, a link
  whose `resolution_state` is not `unreviewed`, a tombstoned link, and notes
  with `notes_edited = 1` are never overwritten.
- **Assumptions become a feature's `notes`** as a numbered markdown list, while
  `notes_edited = 0`.
- **Conflict flags are recomputed** across every live link after the writes,
  so a hand-moved row is judged on where it is now.
- **Stale rows are swept**: an imported release or MVP record the sources no
  longer produce is deleted, unless something still points at it (then kept
  and reported).
- **Known effects:** imported phases' `display_order` is reset to the sources'
  order; a capability or feature deleted in the app but still in the sources is
  re-created (only links remember a removal).

## Fields that break many views if wrong

- `release_id` / `phase_id` on features and capabilities — they place every card.
- `removed_at` — a link with it set must not render; the derive filters on `=== null`.
- `display_order` on releases and phases — column and row order.
- `source` — `manual` is what protects an edit from re-import.
