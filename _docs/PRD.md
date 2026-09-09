# PRD — MSD VD2 Scope Map

An interactive, editable scope and journey map for the PwC VD2 Phase 1 scope, built over
two source documents:

- [`_docs/pwc-scope-to-mvp-mapping.md`](pwc-scope-to-mvp-mapping.md) — 48 PwC features with
  assumptions, mapped to MVP features
- [`_docs/R1-sequenced-release-capabilities-table.md`](R1-sequenced-release-capabilities-table.md) —
  107 sequenced capabilities positioned in a release × phase grid

> **Note for future sessions:** the root `CLAUDE.md` currently describes a "Story Creator"
> app for 8–12 year-olds with dyslexia. That is a stale template from another project and
> does **not** describe this repo. The stack rules in `.claude/rules/` still apply; the
> product sections of `CLAUDE.md` do not. See [D-6](#15-open-decisions).

---

## 1. Problem

The VD2 Phase 1 scope lives across two markdown documents that are individually accurate,
collectively contradictory, and jointly unusable as a working tool.

- **You cannot see the shape of the programme.** Finding what is in MVP 1.2 means scrolling
  704 lines and holding four release boundaries in your head.
- **The connections are invisible.** Both documents are organised as hierarchies, but the
  real structure is a graph. `947 - Staff Can Review and Publish Vacancies` is referenced by
  four separate PwC features; `938`, `951` and `972` each span more than one release.
  Nothing surfaces that — you find it only by noticing the same number twice, hundreds of
  lines apart.
- **The two sources disagree, silently.** 35 of the 123 capability links in the mapping file
  (28%) place a capability in a different release than the sequencing table does. 21 place
  it in a different phase. Nobody can see this today. See [§7](#7-the-two-sources-disagree).
- **Release 1.9 does not exist in the sequencing table at all.** Its capabilities decompose
  across table releases 1.1, 1.4 and 2 — so the mapping file's headline release structure
  is not the delivery sequence.
- **The scope has no owner-editable home.** Corrections happen in email and in comments on
  a document, then get hand-merged. There is no way to record that a conflict was
  investigated and resolved.

## 2. Goals

1. **One screen that shows the whole scope** — every release, all 7 canonical phases and
   48 features legible at a glance, detail on demand.
2. **Find any feature in under five seconds** — by ID, name, phase, release, MVP feature,
   capability text or actor.
3. **Make the connections first-class** — show which features share an MVP feature, and
   therefore share delivery, risk and dependency.
4. **Surface and resolve the source conflicts** — the app is the place where the two
   documents get reconciled, with the decision recorded.
5. **Full CRUD on every entity** — the app becomes the maintained home of the scope, not a
   read-only render of documents that are already drifting.

### Non-goals

- Project management — no estimates, dates, assignees, burndown, or delivery status.
- Replacing Jira or Confluence.
- Multi-user auth, roles, or comment threads in v1.
- Modelling dependencies beyond shared MVP features.

## 3. Users

| User | What they need |
|---|---|
| **Delivery lead / PM** | Release composition, cross-release couplings, conflict resolution |
| **BA / product owner** | Trace a PwC feature to its MVP features, capabilities and assumptions; edit scope as decisions land |
| **Architect / tech lead** | Which MVP features are load-bearing across many PwC features |
| **Client / stakeholder in a walkthrough** | A journey-shaped picture of what arrives when |

The walkthrough case sets the visual bar: the map must be presentable on a screen share
without narration. The BA case sets the editing bar: correcting a feature must take seconds,
not a migration.

### Core use cases

- **UC-1** — "Show me everything in MVP 1.1." → Filter to 1.1; map reduces to its populated cells.
- **UC-2** — "What is `947` used by?" → Select MVP feature 947; its four PwC features
  highlight with connecting edges drawn.
- **UC-3** — "What does the employer do across the programme?" → Filter capabilities by
  actor `employer`; non-matching features dim.
- **UC-4** — "What's coupled across releases?" → Coverage view lists MVP features spanning
  more than one release.
- **UC-5** — "Where do the two documents disagree?" → Reconciliation view lists all 35
  release conflicts and 21 phase conflicts as a work queue.
- **UC-6** — "Option 1A or 1B — what changes?" → Filter by scope option; the map shows only
  the features and MVP records belonging to that option.
- **UC-7** — "Legal changed the T&Cs assumption on F-014." → Open F-014, edit the
  assumption inline, save.

---

## 4. Canonical phases

**The 7 phases in the journey diagram are canonical** — their names, their order, and their
epic references. This overrides the phase ordering and naming in both source documents.

| # | Phase | Epic ref | Epic description |
|---|---|---|---|
| 1 | Access & Onboarding | 179 | Employer Registration & Employer portal onboarding |
| 2 | Employer Profile & Portal | 176 | Manage employer profile — internal/external portal |
| 3 | Manage Vacancies | 177 | Employer can create and manage vacancies |
| 4 | Document Management | 178 | Clients and employers can manage documents to support applications, shortlisting and vacancies |
| 5 | Applications & Referrals | 186 | Staff and clients can create and manage applications |
| 6 | Employer Recruitment | 186 | Employers can Manage Recruitment Against Vacancies |
| 7 | Outcomes & Support | 192 | Employers can communicate with MSD and access support |

Two things to note:

- **`186` appears twice** — on both Applications & Referrals and Employer Recruitment. Epic
  refs are otherwise unique, so this is very likely a typo in the diagram. The app stores
  `epic_ref` as free text and does **not** enforce uniqueness, so it renders faithfully;
  flagged as [D-2](#15-open-decisions).
- **Epic refs (176–192) are a different ID series from MVP feature refs (937–1052).** Do not
  join them.

### "Onboarding via invite" is not a canonical phase

Both source documents carry an 8th grouping, *Onboarding via invite*, which the canonical
diagram does not have. It **folds into Access & Onboarding** (epic 179, "Employer
Registration & Employer portal onboarding").

The sources already support this: 11 capability links sit in mapping-file phase
*Access & onboarding* while the sequencing table places the same capabilities in
*Onboarding via invite*. The two are used interchangeably, and merging them resolves 11 of
the 21 phase conflicts outright.

The import records the original phase label on each row as `source_phase_label`, so the
merge is auditable and reversible.

### Feature distribution after the merge

48 features across 7 phases, 13 of 28 release × phase cells populated:

| Phase | 1.1 | 1.2 | 1.3 | 1.9 | Total |
|---|---|---|---|---|---|
| Access & Onboarding | 6 | · | · | 6 | 12 |
| Employer Profile & Portal | 4 | · | · | 6 | 10 |
| Manage Vacancies | 10 | 1 | · | · | 11 |
| Document Management | · | 2 | · | · | 2 |
| Applications & Referrals | · | 2 | · | · | 2 |
| Employer Recruitment | · | 2 | 3 | · | 5 |
| Outcomes & Support | · | 1 | 2 | 3 | 6 |

---

## 5. Releases

The union of both sources is **six releases**, and they do not agree on which exist:

| Release | In mapping file | In sequencing table | Note |
|---|---|---|---|
| 1.1 Controlled Pilot | ✅ 20 features | ✅ 45 capabilities | |
| 1.2 Client Applications & Referral Pipeline | ✅ 8 features | ✅ 36 capabilities | |
| 1.3 Interactive Recruitment & Progression | ✅ 5 features | ✅ 7 capabilities | |
| 1.4 | ❌ | ✅ 3 capabilities | Table only |
| 1.9 GA & Scale-Up | ✅ 15 features | ❌ | **Mapping only** |
| 2 | ❌ | ✅ 16 capabilities | Table only |

**Release 1.9 is the headline problem.** Its 15 features cite 32 capabilities that the
sequencing table places in release 1.1 (11 links), 1.4 (5 links) and 2 (16 links). So
"1.9 / GA & Scale-Up" is a mapping-file construct, not a sequenced release. The app must
hold both framings and show the decomposition rather than pick a winner — see
[§7](#7-the-two-sources-disagree) and [D-1](#15-open-decisions).

---

## 6. Data model

```
Release (6)
Phase (7 canonical, ordered, with epic_ref)
  └── PwCFeature (48 — each in exactly one release + phase)
        ├── Assumption (92, ordered, free text)
        └── ─┬─ MvpFeature (51 records / 48 refs — Option 1A & 1B are separate records)
             └── Capability (107 distinct — each positioned in its own release × phase cell)
                   └── actor: employer | staff | jobseeker | system
```

**`MvpFeature` is the join that makes this a graph rather than a tree.** Every cross-cutting
relationship in the app derives from two PwC features referencing the same MVP feature.

### Entities

**`releases`** — `id` (`1.1`), `label`, `name`, `description`, `display_order`,
`in_mapping_source`, `in_sequencing_source`. Six rows.

**`phases`** — `id` (slug), `name`, `epic_ref`, `epic_description`, `display_order`. Seven
rows, seeded from [§4](#4-canonical-phases) and ordered 1–7. `epic_ref` is free text and
not unique (see the `186` collision).

**`pwc_features`** — `id` (`F-035`), `name`, `foundational_build`, `release_id`, `phase_id`,
`source_phase_label`, `display_order`. 48 rows, no duplicate IDs. Feature IDs are sparse
(F-004, F-012, F-015 and others are absent) — never assume a contiguous range, and never
infer meaning from the gaps. New features created in the app get the next free `F-` number,
offered as a default the user can override.

**`assumptions`** — `id`, `pwc_feature_id`, `position`, `text`. 92 rows. Order is meaningful
and must survive reordering, insertion and deletion.

**`mvp_features`** — `id` (surrogate), `ref` (integer, `951`), `scope_option`
(`1A` | `1B` | `null`), `title`, plus `source` (`mapping` | `sequencing` | `both` | `manual`).

**Option 1A and 1B are separate feature records**, keyed on `(ref, scope_option)` with a
uniqueness constraint on that pair. That yields **51 records across 48 refs**:

- 42 records from 39 refs in the mapping file, because three refs split:

  | Ref | Splits into | Cited by |
  |---|---|---|
  | 938 | `1A` + *(no option)* | `1A` ← F-001, F-002 · *(none)* ← F-003 |
  | 946 | `1A` + *(no option)* | `1A` ← F-007 · *(none)* ← F-006 |
  | 951 | `1A` + `1B` | `1A` ← F-014 · `1B` ← F-009, F-010 |

- plus 9 refs that exist **only** in the sequencing table: `950`, `957`, `959`, `973`,
  `976`, `986`, `989`, `992`, `993`.
- `937` and `953` exist only in the mapping file and have no capabilities at all.

Only `951` is a genuine either/or (1A = staff-invited registration, 1B = open self-service).
For `938` and `946` one variant is bare, which is most likely loose authoring rather than a
real second option — see [D-3](#15-open-decisions). The uniqueness constraint is on
`(ref, scope_option)`, so resolving a bare record into `1A` later is an edit, not a migration.

**`capabilities`** — `id`, `mvp_feature_id`, `text`, `actor`, `release_id`, `phase_id`,
`source_phase_label`. **107 distinct rows.** The sequencing table is authoritative for a
capability's release and phase, because that is what the table is for. Actor distribution:
employer 46, staff 24, system 22, jobseeker 15.

**`pwc_feature_mvp_features`** — join, 60 rows from import.

**`pwc_feature_capabilities`** — join, 123 rows from import.

### Import reconciliation counts

A drift from these on import is a bug and must fail the boot check:

| | Mapping file | Sequencing table | Merged |
|---|---|---|---|
| Releases | 4 | 5 | **6** |
| Phases | 8 raw | 8 raw | **7 canonical** |
| PwC features | 48 | — | **48** |
| Assumptions | 92 | — | **92** |
| MVP feature refs | 39 | 46 | **48** |
| MVP feature records | 42 | 46 | **51** |
| Distinct capabilities | 91 | 106 | **107** |
| Feature→MVP links | 60 | — | **60** |
| Feature→capability links | 123 | — | **123** |

---

## 7. The two sources disagree

This is the highest-value thing the app can expose, and it is invisible in both documents.

### Release conflicts — 35 of 123 capability links (28%)

| Feature's release | Capability's release in table | Links |
|---|---|---|
| 1.9 | 2 | 16 |
| 1.9 | 1.1 | 11 |
| 1.9 | 1.4 | 5 |
| 1.3 | 1.2 | 2 |
| 1.1 | 1.4 | 1 |

The single 1.1 → 1.4 conflict is worth calling out on its own: F-014 (*Registration and
login page content*, release 1.1) depends on `Electronic T&Cs acceptance`, which the
sequencing table does not deliver until release 1.4. If both documents are right, the pilot
ships a registration page whose T&Cs acceptance is not built. That is either a genuine
sequencing defect or a documentation error, and it is exactly the class of finding this app
exists to surface.

### Phase conflicts — 21 links

| Feature's phase | Capability's phase in table | Links | Features |
|---|---|---|---|
| Access & onboarding | Onboarding via invite | 11 | F-009, F-010, F-011, F-014 |
| Manage Vacancies | Outcomes & Support | 4 | F-039, F-046 |
| Outcomes & Support | Employer Recruitment | 2 | F-085 |
| Employer Profile & Portal | Access & Onboarding | 2 | F-019 |
| Outcomes & Support | Applications & Referrals | 1 | F-090 |
| Outcomes & Support | Manage Vacancies | 1 | F-085 |

The first row resolves automatically via the canonical phase merge ([§4](#4-canonical-phases)),
leaving 10 for human review.

### Unmatched links — 2

F-050 and F-051 both cite `Review & publish vacancies (staff, 947)`, which has no exact
match in the table. The table's nearest row is `Review & publish vacancies. Staff can also
request specific corrections to vacancies (staff, 947)`. Almost certainly a truncation, but
the importer must not merge on a prefix match — it records these as unmatched and lets a
human confirm.

### How the app treats a conflict

- **R-7.1** A conflict is **data, not an error.** Import records both placements and marks
  the link `conflicted`. Nothing is silently overwritten and neither source is discarded.
- **R-7.2** Every conflict gets a resolution state: `unreviewed` | `mapping_wins` |
  `table_wins` | `both_correct` | `defect_raised`, with an optional note and a timestamp.
- **R-7.3** Resolving a conflict is a normal CRUD action from the reconciliation view.
- **R-7.4** Features and capabilities carrying an unreviewed conflict are badged on the map,
  so a conflict is visible without opening the reconciliation view.

---

## 8. Views

### 8.1 Scope Map — primary view (`/`)

A single grid. **Releases on the X axis** (1.1 → 1.2 → 1.3 → 1.4 → 1.9 → 2, the sequence
dimension). **Canonical phases on the Y axis**, rows 1–7. Cells hold the feature cards for
that release × phase pair. Empty cells stay visible as faint placeholders — an empty cell is
information: nothing in that phase lands in that release.

- **R-8.1** Feature card shows ID, name, MVP feature chips (with the `1A`/`1B` option where
  set), an actor summary, and a conflict badge if applicable.
- **R-8.2** **Connection edges.** On hover or select, draw edges to every other card sharing
  an MVP feature, labelled with the shared ref. Off by default — 60 links drawn at once is
  noise, not insight.
- **R-8.3** **Connection density** shown passively per card, so load-bearing features
  (F-039, F-045, F-046, F-050, F-051 via `947`) read as important before any interaction.
- **R-8.4** Cross-release edges (`938`, `951`, `972`) render distinctly from within-release
  edges — these are the couplings that matter most to a delivery plan.
- **R-8.5** A capability layer toggle overlays each cell's capability count, so the map can
  be read feature-first or capability-first. Release 1.4 and 2 columns have capabilities but
  no features; the map must not render them as empty.
- **R-8.6** Selecting anything sets a URL param, so any view can be linked or shared.
- **R-8.7** Pan and zoom, plus zoom-to-fit. The full map must fit a 1440px screen legibly at
  default zoom, even if cards collapse to ID-only chips to do it.

### 8.2 Filter rail

Opens as a column beside the map, never as a modal, and reshapes the map in place. Filters
compose — AND across categories, OR within a category.

> **Amended after Phase 4.** This originally read "persistent, always visible". The rail is
> now **hidden by default** behind a filters button, on the grounds that the map is the point
> and the rail is a tool. Two things keep the earlier requirement's intent: the button carries
> a count of the active filter groups, so a filtered view never looks unfiltered; and the
> zero-result state offers to reveal the rail, so the cause of an empty map is always
> reachable. It remains a column, never a modal.

- **R-8.8** Release (6), Phase (7), Actor (4), MVP feature (48 refs, searchable), Scope
  option (1A / 1B / unspecified), Conflict state, Source (mapping / table / both / manual).

  > **Amended after Phase 9.** The Source filter was briefly retired after Phase 4 and has
  > been restored — provenance turned out to be a useful way to narrow the map once manual
  > edits started accumulating.
  >
  > A **PwC feature** group is added, so a known set of F-nnn features can be isolated on the
  > map directly.
  >
  > The MVP feature and PwC feature groups show only their search field until something is
  > typed: 48 refs and 49 features are too long to sit open in the rail. Anything already
  > selected stays visible while collapsed, so an active filter is never hidden.
- **R-8.9** Every control shows a live result count. A single visible "clear all" resets.
  Active filters reflect in the URL.
- **R-8.10** A zero-result combination names the filter that caused it and offers to drop
  that one — never a bare empty panel.

### 8.3 Search

- **R-8.11** One always-reachable field, matching feature ID, feature name,
  foundational-build text, MVP ref and title, capability text, assumption text, and epic ref.
- **R-8.12** Results grouped by what matched — a hit inside an assumption means something
  different from a hit on a title.
- **R-8.13** Keyboard-navigable; Enter selects and reveals the feature on the map.

### 8.4 Feature detail panel

Opens beside the map — never over it, never as a route change that loses map state.

- **R-8.14** Shows ID, name, release, phase (with epic ref), foundational-build statement,
  assumptions in source order, mapped MVP features with scope option, and capabilities
  grouped by actor with each capability's own release × phase.
- **R-8.15** Where a capability's placement differs from the feature's, show both inline
  with the conflict state. This is the single most useful thing on the panel.
- **R-8.16** MVP chips pivot the map to that MVP feature (UC-2) without closing the panel.
- **R-8.17** A "connected features" list — others sharing an MVP feature — flagging which
  connections cross a release boundary.
- **R-8.18** Where a feature has no mapped capabilities (F-008, F-029), state the source's
  own qualifier rather than rendering an empty section.
- **R-8.19** Inline edit affordances on every field, per [§9](#9-crud-and-forms).

### 8.5 Reconciliation view (`/reconciliation`)

The work queue for [§7](#7-the-two-sources-disagree). Groups the 35 release conflicts and
10 remaining phase conflicts by type, shows both placements side by side, and lets a user
set a resolution state and note without leaving the list. Filterable by resolution state so
the unreviewed set shrinks visibly as work happens.

### 8.6 Coverage view (`/coverage`)

- **R-8.20** MVP features ranked by referencing PwC feature count (947 = 4; 938, 951, 969,
  990 = 3; then 10 at 2).
- **R-8.21** MVP features spanning more than one release, called out separately.
- **R-8.22** Orphans in both directions: MVP features with no capabilities (`937`, `953`);
  the 9 table-only refs with no PwC feature; features with no capabilities (F-008, F-029).
- **R-8.23** Feature and capability counts per release and per cell.
- **R-8.24** Actor breakdown per release — showing, for instance, that jobseeker
  capabilities appear only from 1.2 onward.

---

## 9. CRUD and forms

Every entity is fully creatable, readable, updatable and deletable through the UI. This
makes SQLite the source of truth after import ([§11](#11-import)), not a cache of the
markdown.

**R-9.1 — Coverage.** Full CRUD on `releases`, `phases`, `pwc_features`, `assumptions`,
`mvp_features`, `capabilities`, and both join tables. Nothing is editable only by SQL.

**R-9.2 — Editing happens in context.** The primary path is the detail panel: click a field,
edit, save. A separate admin list page per entity (`/manage/:entity`) exists for bulk work
and for entities without a natural home on the map — but the map is never a read-only view
you have to leave in order to fix something.

**R-9.3 — Validation, server-side and shared.** One Zod schema per entity in
`src/lib/validators.ts`, used by both the form and the route handler. Client-side validation
alone is not validation.

Rules that must be enforced:
- `pwc_features.id` matches `F-\d{3}` and is unique.
- `pwc_features` requires a release and a phase — the map has nowhere to draw an orphan.
- `mvp_features` is unique on `(ref, scope_option)`; `scope_option` ∈ `1A` | `1B` | `null`.
- `capabilities.actor` ∈ the four known actors; a new actor is a schema change, not free text.
- `capabilities` requires a release and a phase.
- `assumptions.position` stays contiguous per feature after any insert, delete or reorder.
- `phases.display_order` stays contiguous 1–n.

**R-9.4 — Referential integrity is explicit, never silent.** `foreign_keys = ON`. Deleting
anything with dependents is refused with a message naming what depends on it and how many
(*"Cannot delete MVP feature 947 — 4 PwC features and 6 capabilities reference it"*), and
offers the cascade as a separate, explicitly confirmed action. Assumptions and join rows
cascade from their parent; features, releases, phases and MVP features never cascade
silently.

**R-9.5 — Destructive actions confirm with specifics.** The dialog states exactly what will
be removed and how many rows. No bare "Are you sure?".

**R-9.6 — Optimistic UI with real rollback.** Mutations update the TanStack Query cache
optimistically and roll back on error with the server's message surfaced. A failed save
never leaves the map showing a value the database rejected.

**R-9.7 — Create flows pre-fill from context.** Adding a feature from a map cell pre-fills
that release and phase. Adding a capability from an MVP feature pre-fills the ref.

**R-9.8 — Ordered lists are reorderable** without drag-and-drop being the only route —
assumptions and phases both need explicit move-up / move-down controls alongside any drag
affordance.

**R-9.9 — Provenance survives editing.** Every row keeps `source`
(`mapping` | `sequencing` | `both` | `manual`), `created_at` and `updated_at`. A manually
created row is distinguishable from an imported one forever, and the map can show what has
diverged from the documents.

**R-9.10 — Re-import never destroys manual work.** See [R-11.4](#11-import).

**R-9.11 — Markdown export.** `GET /api/export/mapping.md` and `/api/export/sequencing.md`
regenerate both source documents from the database in their original format.

> This is not in the original brief. It is included because once CRUD exists, the database
> and the documents diverge immediately, and the documents are what circulates with PwC.
> Without export the app becomes a silo holding the only current copy of the scope. Cuttable
> if you disagree — see [D-5](#15-open-decisions).

---

## 10. UX requirements

- **R-10.1 One UI.** Map, filters, search and detail coexist. Filtering, selecting and
  editing mutate the same screen. No page-to-page navigation for core tasks.
- **R-10.2 Every state is URL-addressable** — filters, search, selection. This view gets
  shared in Slack mid-meeting; a link must reproduce it exactly.
- **R-10.3 Nothing hidden behind hover alone.** Hover may reveal edges as a shortcut; the
  same information must be reachable by click and by keyboard.
- **R-10.4 Keyboard navigable throughout** — `/` focuses search, arrows move between cards,
  Enter opens detail, Escape closes. Forms are fully keyboard-operable and submit on Enter.
- **R-10.5 Responsive to tablet.** Below `md` the X/Y grid stops working; fall back to a
  release-grouped accordion with the same filters, detail panel and edit affordances. The
  map is a desktop affordance; the data and the editing must not be.
- **R-10.6 Accessible colour.** Release, actor and conflict state encode by more than hue —
  label, shape or position too. WCAG AA contrast throughout. Form errors are never
  colour-only.
- **R-10.7 No spinner on filter.** The whole dataset is small (48 features, 107
  capabilities, 123 links) — load once, filter client-side, respond instantly.
- **R-10.8 Unsaved-change protection.** Navigating away from a dirty form warns first.

---

## 11. Import

A one-time seed, plus a re-runnable reconciling import. **After the first import, SQLite is
the source of truth** — the markdown files are inputs, not live state.

- **R-11.1** Two parsers, `server/services/mapping-parser.ts` and
  `server/services/sequencing-parser.ts`, each standalone and unit-tested against fixture
  markdown with no database. These are the highest-risk components in the app.
- **R-11.2** Parsers **fail loudly**. An unrecognised heading, an unparseable capability
  line, or a table cell that is neither `-` nor a `<br>`-joined bullet list raises an error
  naming the source line. Silent skipping would let scope quietly vanish.
- **R-11.3** Import logs a reconciliation summary against the [§6](#6-data-model) table and
  fails the boot check on any drift.
- **R-11.4** Re-import is **additive and non-destructive**. It inserts new rows, reports
  changed rows for review, and **never** overwrites a row whose `source` is `manual` or
  whose conflict has been resolved. Re-import is an explicit action, not something that
  happens on every server start after the first.

### Known parser hazards — all confirmed present

**Mapping file:**
- **Inconsistent bullet formatting.** Line 90 reads `  * *(No direct individual…)*`; line 668
  reads `  *(Mapped under Release 2+ in table)*` — missing the bullet's space. Both mean "no
  capabilities, with a reason", not "a capability".
- **`(Option 1A)` / `(Option 1B)` title suffixes** on refs 938, 946, 951 — strip to
  `scope_option` and key on `(ref, scope_option)`. Leaving the suffix in the title produces
  three phantom MVP features with near-identical names.
- **Case-variant capability text.** `Filter and Sort Applications` and `Filter and sort
  applications` both appear under ref 980 and are the same capability. Deduplicate
  case-insensitively; keep first-seen casing for display.
- **Near-duplicate capability text.** Ref 941 carries both `View authenticated landing page /
  dashboard` and `View authenticated landing page`; ref 956 has a similar pair. **Not** safe
  to auto-merge — keep both, flag in coverage for a human ([D-4](#15-open-decisions)).

**Sequencing table:**
- Cells are `<br>`-joined bullet lists inside a single markdown table cell — split on `<br>`,
  then strip the leading `•`.
- Empty cells are a literal `-`, not blank. 24 of the 40 cells are empty.
- Release labels are bolded (`**Release 1.1**`) and `Release 2` has no minor version.
- Phase names come from the header row and differ in casing from the mapping file
  (`Access & Onboarding` vs `Access & onboarding`) — normalise to canonical before matching.

**Both:**
- Em-dashes, `&`, `/`, `,` and curly apostrophes appear inside names. None are safe
  delimiters. Parse capability strings with an anchored regex on the trailing
  `(actor, ref)`, not by splitting.

---

## 12. Technical approach

Follows [`rules-react-shadcn-tailwind.md`](../.claude/rules/rules-react-shadcn-tailwind.md)
and [`rules-database.md`](../.claude/rules/rules-database.md). No deviation from the
established stack is proposed.

| Concern | Approach |
|---|---|
| Parsers | `server/services/{mapping,sequencing}-parser.ts` — pure, tested, no DB |
| Storage | SQLite (`better-sqlite3`), `journal_mode = WAL`, `foreign_keys = ON` |
| Migrations | Numbered `.sql` in `server/migrations/`, applied on boot |
| Repositories | One per entity in `server/repositories/`; all SQL lives here, prepared lazily with `??=` |
| API | `GET /api/scope` returns the whole graph in one payload; REST CRUD per entity; `POST /api/import`; `GET /api/export/*` |
| Validation | Zod in `src/lib/validators.ts`, shared by form and route handler |
| Client data | TanStack Query — one graph query, mutations invalidate it once |
| Filter state | URL search params as the single source of truth, via React Router v7 |
| Map rendering | SVG edge overlay above a CSS-grid card layout. The grid is 6×7 — well within CSS grid; a graph library is not warranted |
| Forms | Shadcn form primitives; BEM per [`rules-css-bem.md`](../.claude/rules/rules-css-bem.md) for the custom components |
| Styling | Tailwind for grid and page layout; BEM files for feature card, filter rail, detail panel, conflict badge |
| Tokens | `src/globals.css` `@theme` only — including release, actor and conflict-state colours |

**No AI, no Anthropic API, no file uploads.** `rules-ai-api.md` does not apply to this app.

Transactions matter more than usual here: assumption reorder, cascade delete, and import are
all multi-step writes and must use `db.transaction(fn)()`.

### Build order

1. **Both parsers + fixtures + tests.** No UI. Until the reconciliation counts in
   [§6](#6-data-model) come out exact, nothing downstream is trustworthy.
2. Migrations, repositories, `GET /api/scope`.
3. Static map grid — cards in cells, no filtering, no edges, no editing.
4. Filter rail + URL state.
5. Detail panel (read-only).
6. **CRUD** — routes, validators, forms, referential-integrity guards.
7. Connection edges.
8. Reconciliation view.
9. Search.
10. Coverage view.
11. Markdown export.
12. Tablet fallback layout.

Steps 1–3 are the walking skeleton and should be demonstrable before anything else starts.
Step 6 is the largest single chunk and benefits from one entity done end-to-end
(`pwc_features`) as the pattern before the rest follow.

---

## 13. Success criteria

- A stakeholder who has never read either document can state what is in MVP 1.2 within 30
  seconds of the map loading.
- All seven core use cases complete without leaving the main screen.
- Import reports exactly the [§6](#6-data-model) counts: 6 releases, 7 phases, 48 features,
  51 MVP records across 48 refs, 107 capabilities, 92 assumptions, 60 MVP links, 123
  capability links, 35 release conflicts, 21 phase conflicts.
- Every entity is creatable, editable and deletable from the UI, with a delete blocked by
  dependents producing a specific, actionable message.
- Any view is reproducible from its URL alone.
- Filter response is imperceptible — no spinner, no layout thrash.
- Regenerated markdown round-trips: export → re-import produces an identical database.
- `npm run test`, `npm run lint` and `npm run build` pass.

## 14. Out of scope for v1

Auth and multi-user · comment threads · PDF or PowerPoint export · Jira or Confluence
integration · effort estimates and dates · delivery status tracking · dependency modelling
beyond shared MVP features · diffing two versions of a source document · full row-level
audit history (only `created_at` / `updated_at` / `source` in v1).

## 15. Open decisions

Recorded rather than assumed. Build can start on the recommendation in each case.

**D-1 — How should Release 1.9 be represented?** Its 15 features cite capabilities the
sequencing table places in 1.1, 1.4 and 2. *Recommendation:* keep 1.9 as a release so the
mapping file stays representable, show its decomposition in the reconciliation view, and
treat the choice of which framing is authoritative as a programme decision the app records
rather than makes. This is the most consequential open question in the dataset.

**D-2 — Epic ref `186` appears on two phases** (Applications & Referrals, Employer
Recruitment). Almost certainly a diagram typo. Stored faithfully and not enforced unique;
needs confirming with whoever owns the journey diagram.

**D-3 — Are bare `938` and `946` really separate from their Option 1A records?** Option 1A
and 1B are separate features per the brief, which is unambiguous for `951`. For `938` and
`946` one variant carries no option, which reads more like loose authoring. Modelled as
separate records for now; resolving a bare record into `1A` later is a single edit.

**D-4 — Are the near-duplicate capabilities under refs 941 and 956 intentional?** Treated as
distinct and flagged for review. If they are source duplication, the capability count drops
below 107.

**D-5 — Keep markdown export?** Recommended and specified in
[R-9.11](#9-crud-and-forms), but it is an addition to the brief. Cutting it means the
database becomes the only current copy of the scope and the circulating documents go stale
immediately.

**D-6 — Stale `CLAUDE.md`.** Its product sections describe an unrelated project and
currently instruct future sessions to apply neurodivergent-child accessibility constraints
and an "AI never writes the story" rule that have no bearing here. It should be rewritten
for this app before implementation begins. The stack and styling rules in `.claude/rules/`
are sound and should be kept as-is.

---

## 16. Scope principles

Added after the Phase 2 build, from a programme decision. These govern how the
model is read and override anything in §6 or §7 that contradicts them.

### P-1 — A PwC feature exists in exactly one place

A `pwc_feature` belongs to exactly one release and one canonical phase. There
is no multi-placement and no "primary" placement — the map has one cell per
feature.

Already enforced: `pwc_features.release_id` and `phase_id` are single-valued
and `NOT NULL`.

**Consequence.** A feature whose capabilities span two phases is a candidate
for *splitting*, not for multi-placement. F-085 is the live example: it cites
`Extend vacancy` (Manage Vacancies) alongside `Shortlist / progress candidates`
and `Manage Applicant Progression and Outcomes` (Employer Recruitment).

### P-2 — A capability may belong to many PwC features

Capabilities are shared. The same capability can be cited by any number of
features, in any number of phases and releases.

Already supported: `pwc_feature_capabilities` is many-to-many. In the current
data **26 of 91 cited capabilities are referenced by more than one feature**.

**Consequence, and the reason this matters.** A capability's `release_id` and
`phase_id` are currently single values taken from the sequencing table. Under
P-2 that single value is *one opinion about placement*, not the truth: a shared
capability's real phase is a **span** derived from the features citing it.

This reclassifies phase disagreements into two different things:

| | Meaning | Treatment |
|---|---|---|
| Capability is cited from features in more than one phase | Legitimately cross-cutting | **Information**, not a conflict |
| Capability is cited from one phase but the table places it elsewhere | The feature or the table is wrong | **A finding** for review |

Cross-phase citation is rarer than it looks — **5 capabilities of 91**, and
three of those five are F-085's:

| Capability | Cited from |
|---|---|
| View authenticated landing page / dashboard (941) | F-006 [Access & Onboarding], F-019 [Employer Profile & Portal] |
| View authenticated landing page (941) | F-006, F-019 |
| Extend vacancy (972) | F-086 [Manage Vacancies], F-085 |
| Shortlist / progress candidates (990) | F-077, F-078 [Employer Recruitment], F-085 |
| Manage Applicant Progression and Outcomes (990) | F-077, F-078, F-085 |

Note that `Employer Operational Notifications` (970) is **not** among them.
It is cross-cutting in concept, but in this dataset it is cited only from
Manage Vacancies (F-039, F-046) while the table places it in Outcomes &
Support — so it is a finding under the table above, not a span.

**Implementation is deferred to Phase 9** (reconciliation view). The schema is
unchanged; `EXPECTED_COUNTS` still enforces today's conflict figures. Phase 9
presents the split and re-baselines the counts with sign-off.

### P-3 — Source documents are never edited

The markdown files are inputs. A correction is declared in
`server/services/scope-overrides.ts` and re-applied on every import, so it
survives a rebuilt database, is visible in version control, and is reversed by
deleting one entry. Overrides are applied **before** reconciliation, so
conflicts are derived from the corrected placement rather than left stale.

#### Recorded overrides

| ID | Kind | Target | Change | Effect |
|---|---|---|---|---|
| ~~OV-001~~ | placement | F-085 | Outcomes & Support / 1.3 → Manage Vacancies / 1.1 | superseded by OV-002 |
| OV-002 | split | F-085 | divided into F-085 + F-093 | features 48 → 49; release conflicts 35 → 34, phase 21 → 18 |

**OV-002 — the F-085 split.** OV-001 moved the whole feature and raised its
release conflicts from 1 to 3, because two of its three capabilities are
sequenced at 1.3 in Employer Recruitment. Under P-1 no single placement could
be right: the feature conflated a *vacancy* outcome with an *applicant*
outcome. The split falls on the MVP feature boundary, and each half then agrees
with the sequencing table on both phase and release:

| | Feature | MVP | Capabilities | Phase | Release |
|---|---|---|---|---|---|
| A | F-085 *Record vacancy outcome* | 972 | Extend vacancy | Manage Vacancies | 1.2 |
| B | F-093 *Record applicant progression outcome* | 990 | Shortlist / progress candidates · Manage Applicant Progression and Outcomes | Employer Recruitment | 1.3 |

Both halves carry **zero conflicts**. The three assumptions divide along the
same seam — #1 is vacancy-outcome, #2 and #3 are application-outcome and
referral/shortlisting flow — and each half is renumbered from 1.

A split redistributes scope and never adds or drops any: `featureMvpLinks`
(60), `featureCapabilityLinks` (123) and `assumptions` (92) are all unchanged,
and every assigned MVP ref and assumption position is validated to appear
exactly once or the import fails.

### Release 1.9 is a bucket, not a sequenced release

Recorded here because it answers the framing question behind [D-1](#15-open-decisions).

1.9 appears only in the mapping file; the sequencing table has no 1.9 column
at all. Of the **32 capability links from its 15 features, all 32 conflict** —
the table schedules every one of them in 1.1 (11), 1.4 (5) or 2 (16). Nothing
anywhere in the table is sequenced as 1.9.

So `1.9 → 2` means: a feature the mapping file files under 1.9 cites a
capability the table delivers in Release 2. 1.9 has no independent sequencing
identity; it is a label meaning "later" that decomposes into three real
releases. F-029 is the clearest case — it has no capability links at all.
