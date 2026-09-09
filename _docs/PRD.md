# PRD — MSD VD2 Scope Map

An interactive scope and journey map for the PwC VD2 Phase 1 scope, built over
[`_docs/pwc-scope-to-mvp-mapping.md`](pwc-scope-to-mvp-mapping.md).

> **Note for future sessions:** the root `CLAUDE.md` currently describes a "Story Creator"
> app for 8–12 year-olds with dyslexia. That is a stale template carried in from another
> project and does **not** describe this repo. The stack rules in `.claude/rules/` still
> apply; the product sections of `CLAUDE.md` do not. See [Open decisions](#12-open-decisions).

---

## 1. Problem

The VD2 Phase 1 scope currently lives as a 704-line markdown document. It is accurate but
effectively unreadable as a working tool:

- **You cannot see the shape of the release.** Finding what is in MVP 1.2 means scrolling
  and holding four release boundaries in your head.
- **The connections are invisible.** The document is organised as a strict hierarchy
  (release → phase → feature), but the real structure is a graph. `947 - Staff Can Review
  and Publish Vacancies` is referenced by four separate PwC features; `938` and `951` each
  span two different releases. Nothing in the document surfaces that — you only find it by
  noticing the same number twice, hundreds of lines apart.
- **Answering a routine question takes minutes.** "Which features does MVP feature 990
  underpin?" "What does the employer actually get in 1.1?" "Which features have no mapped
  capabilities?" are all `grep`-and-reconcile exercises today.
- **Gaps hide.** Two features (F-008, F-029) have no capabilities mapped in the Release 1.1–1.3
  table. That is a real signal, buried in an italic aside.

## 2. Goals

1. **One screen that shows the whole scope** — all 4 releases, 8 phases and 48 features
   legible at a glance, with detail on demand.
2. **Find any feature in under five seconds** — by ID, name, phase, release, MVP feature,
   capability text or actor.
3. **Make the connections first-class** — show which features share an MVP feature, and
   therefore share delivery, risk and dependency.
4. **Filter without losing your place** — narrowing by release or phase reshapes the map
   in place; it never navigates away.
5. **Stay faithful to the source** — the markdown document remains the single source of
   truth. The app renders it; it never becomes a second, diverging copy.

### Non-goals

- Editing scope. The app is read-only (see [§7](#7-data-ingestion--source-of-truth)).
- Project management — no estimates, dates, assignees, burndown, or status tracking.
- Replacing the source document, Jira, or Confluence.
- Multi-user accounts, auth, or comments in v1.

## 3. Users

| User | What they need |
|---|---|
| **Delivery lead / PM** | Release composition, cross-release couplings, coverage gaps |
| **BA / product owner** | Trace one PwC feature to its MVP features, capabilities and assumptions |
| **Architect / tech lead** | Which MVP features are load-bearing across many PwC features |
| **Client / stakeholder in a walkthrough** | A journey-shaped picture of what arrives when |

The stakeholder-walkthrough case is the one that sets the visual bar: the map has to be
presentable on a screen share without narration.

### Core use cases

- **UC-1** — "Show me everything in MVP 1.1." → Filter to release 1.1; map reduces to
  4 phases, 20 features.
- **UC-2** — "What is `947` used by?" → Select MVP feature 947; the four PwC features that
  reference it highlight, with connecting edges drawn.
- **UC-3** — "What does the employer do across the whole programme?" → Filter capabilities
  by actor `employer`; features with no employer-facing capability dim out.
- **UC-4** — "What's coupled across releases?" → Coverage view lists the 3 MVP features
  spanning more than one release and the 15 shared by more than one PwC feature.
- **UC-5** — "Where are the holes?" → Coverage view lists features with zero mapped
  capabilities and MVP features whose capabilities sit outside Release 1.

---

## 4. Data model

Derived directly from the source document. Counts are measured, not estimated.

```
Release (4)
  └── Phase (8 distinct; 15 release×phase groupings)
        └── PwCFeature (48, F-001…F-092, each in exactly one release + phase)
              ├── Assumption (92 total, ordered, free text)
              └── ─┬─ MvpFeature (39 distinct, 937…1052; 60 link rows)
                   └── Capability (92 distinct texts, 123 link rows)
                         └── actor: employer | staff | jobseeker | system
```

**`MvpFeature` is the join that makes this a graph rather than a tree.** Every
cross-cutting relationship in the app is derived from two PwC features referencing the
same MVP feature ID.

### Entities

**`releases`** — `id` (`1.1`), `label` (`MVP1.1`), `name`, `description`, `display_order`.
Four rows: 1.1 Controlled Pilot · 1.2 Client Applications & Referral Pipeline ·
1.3 Interactive Recruitment & Progression · 1.9 GA & Scale-Up.

**`phases`** — `id` (slug), `name`, `display_order`. Eight rows. **The source document has
no canonical phase order** — phases appear in a different sequence in each release. The
app must impose one explicit journey order (see [Open decisions](#12-open-decisions)):

`Onboarding via invite → Access & onboarding → Employer Profile & Portal → Manage
Vacancies → Document Management → Applications & Referrals → Employer Recruitment →
Outcomes & Support`

**`pwc_features`** — `id` (`F-035`), `name`, `foundational_build` (the "Included in
foundational build" line), `release_id`, `phase_id`, `display_order`. 48 rows, no duplicate
IDs. Feature IDs are sparse (F-004, F-012, F-015 etc. are absent) — the app must not assume
a contiguous range or infer meaning from the gaps.

**`assumptions`** — `id`, `pwc_feature_id`, `position`, `text`. 92 rows. Order is meaningful
and must be preserved.

**`mvp_features`** — `id` (integer, `947`), `title`. 39 rows. **Key on the integer ID only.**
Three IDs carry inconsistent titles in the source:

| ID | Variants in source |
|---|---|
| 938 | `…Additional Employer Portal Users (Option 1A)` / `…Additional Employer Portal Users` |
| 946 | `…User Access and Permissions (Option 1A)` / `…User Access and Permissions` |
| 951 | `…New organisation (Option 1A)` / `…New organisation (Option 1B)` |

The `(Option 1A)` / `(Option 1B)` suffix is a **scope-option attribute, not part of the
title**. It must be stripped into `pwc_feature_mvp_features.scope_option` (`1A` | `1B` |
`null`) so that Option 1A and Option 1B scope can be filtered independently. Treating the
suffix as title text would produce 42 phantom MVP features instead of 39.

**`pwc_feature_mvp_features`** — join table, 60 rows, plus `scope_option`.

**`capabilities`** — `id`, `mvp_feature_id`, `text`, `actor`. 92 distinct texts across 123
link rows. Actor distribution by link: employer 58, staff 27, system 26, jobseeker 12.

**`pwc_feature_capabilities`** — join table, 123 rows.

---

## 5. Views

### 5.1 Scope Map — the primary view (`/`)

A single grid. **Releases on the X axis** (1.1 → 1.2 → 1.3 → 1.9, left to right, the
sequence dimension). **Phases on the Y axis** in journey order. Each of the 15 populated
cells holds the feature cards for that release×phase pair; empty cells stay visible as
faint placeholders, because an empty cell is information — it says *nothing in this phase
lands in this release*.

- **R-1.1** Feature card shows: ID, name, MVP feature ID chips, and a small actor summary.
  Cards are the primary click target and open the detail panel.
- **R-1.2** **Connection edges.** On hovering or selecting a card, draw edges to every
  other card sharing an MVP feature ID, labelled with the shared ID. Edges are off by
  default — 60 link rows drawn at once is noise, not insight.
- **R-1.3** **Connection density.** Each card carries a passive indicator of how many other
  features it connects to, so the load-bearing features (F-039, F-045, F-046, F-050, F-051
  via `947`) read as important before you interact with anything.
- **R-1.4** Cross-release edges (via `938`, `951`, `972`) render distinctly from
  within-release edges. These are the couplings that matter most to a delivery plan.
- **R-1.5** Selecting a card sets a URL param, so any view can be linked or shared.
- **R-1.6** Pan and zoom, or a zoom-to-fit control. The full map must fit a 1440px screen
  at default zoom in a legible form, even if cards collapse to ID-only chips to do it.

### 5.2 Filter rail

Persistent, always visible, never a modal. Filters compose (AND across categories, OR
within a category) and reshape the map in place.

- **R-2.1** Release — multi-select, 4 options, with feature counts.
- **R-2.2** Phase — multi-select, 8 options, with counts.
- **R-2.3** Actor — multi-select, 4 options. Filters on the capabilities beneath a feature;
  a feature matches if any of its capabilities has a selected actor.
- **R-2.4** MVP feature — multi-select, 39 options, searchable. Selecting one is the
  fastest path to UC-2.
- **R-2.5** Scope option — 1A / 1B / unspecified. Relevant to 3 MVP features but decisive
  for the Option 1A vs 1B scope conversation.
- **R-2.6** Every filter control shows a live result count, and a single visible
  "clear all" resets state. Active filters are reflected in the URL.
- **R-2.7** A zero-result filter combination shows which filter caused it and offers to
  drop that one — never a bare empty panel.

### 5.3 Search

- **R-3.1** One search field, always reachable, matching across feature ID, feature name,
  foundational-build text, MVP feature ID and title, capability text, and assumption text.
- **R-3.2** Results grouped by what matched (feature name vs. assumption text), because
  matching inside an assumption means something different from matching a title.
- **R-3.3** Results are keyboard-navigable; Enter selects and reveals the feature on the map.
- **R-3.4** Match term highlighted in the detail panel when arriving from search.

### 5.4 Feature detail panel

Opens beside the map — never over it, and never as a route change that loses map state.

- **R-4.1** Shows: ID, name, release, phase, foundational-build statement, all assumptions
  in source order, mapped MVP features, and capabilities grouped by actor.
- **R-4.2** Every MVP feature chip is clickable and pivots the map to that MVP feature
  (UC-2) without closing the panel.
- **R-4.3** A "connected features" list — other PwC features sharing an MVP feature —
  showing the shared ID and whether the connection crosses a release boundary.
- **R-4.4** Where a feature has no mapped capabilities (F-008, F-029), say so explicitly
  with the source's own qualifier, e.g. *"No direct individual capabilities mapped in the
  Release 1.1–1.3 table."* Do not render an empty section.
- **R-4.5** A link to the exact line in the source document.

### 5.5 Coverage view (`/coverage`)

The view that answers UC-4 and UC-5 — the questions the source document actively hides.

- **R-5.1** MVP features ranked by how many PwC features reference them (947 = 4;
  938, 951, 969, 990 = 3; then 10 at 2).
- **R-5.2** The 3 MVP features spanning more than one release, called out separately:
  `938` (1.1, 1.9) · `951` (1.1, 1.9) · `972` (1.2, 1.3).
- **R-5.3** Features with zero mapped capabilities, with the source's stated reason.
- **R-5.4** Feature counts per release and per release×phase cell.
- **R-5.5** Capability actor breakdown per release — showing, for instance, that jobseeker
  capabilities appear only from 1.2 onward.

---

## 6. UX requirements

- **R-6.1 One UI, no page-to-page navigation for core tasks.** Map, filters, search and
  detail coexist. Filtering and selecting mutate the same screen.
- **R-6.2 Every state is URL-addressable** — filters, search, selected feature, selected
  MVP feature. This view gets shared in Slack mid-meeting; a link must reproduce it exactly.
- **R-6.3 Nothing is hidden behind hover alone.** Hover may reveal edges as a shortcut, but
  the same information must be reachable by click, and by keyboard.
- **R-6.4 Keyboard navigable throughout** — `/` focuses search, arrows move between cards,
  Enter opens detail, Escape closes.
- **R-6.5 Responsive down to tablet.** Below `md` the X/Y grid stops working; fall back to
  a release-grouped accordion list with the same filters and detail panel. The map is a
  desktop affordance; the data must remain fully reachable without it.
- **R-6.6 Accessible colour.** Release and actor are encoded by more than hue — label,
  shape or position as well. Meets WCAG AA contrast.
- **R-6.7 No loading spinner on filter.** The whole dataset is small enough (48 features,
  123 capability links) to load once and filter client-side. Filtering is instant.

---

## 7. Data ingestion & source of truth

`_docs/pwc-scope-to-mvp-mapping.md` stays the single source of truth. The app never writes
to it, and scope is never edited in the UI.

**Approach:** a parser reads the markdown and populates SQLite on server start, replacing
the previous contents wholesale. Editing the document and restarting is the update path.

- **R-7.1** The parser is a standalone, unit-tested module — it is the highest-risk part of
  the app and must be testable against fixture markdown without a database.
- **R-7.2** The parser **fails loudly**. An unrecognised heading, an unparseable capability
  line, or a feature with no MVP mapping raises a clear error naming the source line
  number. Silent skipping would let scope quietly vanish from the map.
- **R-7.3** After ingest, log a reconciliation summary — releases, phases, features,
  MVP features, capabilities, assumptions parsed — so a drift from the expected
  4 / 8 / 48 / 39 / 92 / 92 is visible on boot.
- **R-7.4** Known parser hazards, all confirmed present in the source:
  - **Inconsistent bullet formatting.** Line 90 reads `  * *(No direct individual…)*`;
    line 668 reads `  *(Mapped under Release 2+ in table)*` — missing the bullet's space.
    Both must be recognised as "no capabilities, with a reason", not as a capability.
  - **`(Option 1A)` / `(Option 1B)` title suffixes** on IDs 938, 946, 951 — strip to
    `scope_option`, key on the integer ID (see [§4](#4-data-model)).
  - **Case-variant capability text.** `Filter and Sort Applications` and `Filter and sort
    applications` both appear under MVP 980 and are the same capability. Normalise
    case-insensitively when deduplicating; preserve the first-seen casing for display.
  - **Near-duplicate capability text.** MVP 941 carries both `View authenticated landing
    page / dashboard` and `View authenticated landing page`. These are *not* safe to merge
    automatically — keep both and flag them in the coverage view for a human to resolve.
  - **Em-dashes, `&`, `/` and curly apostrophes** in names — do not use them as delimiters.
- **R-7.5** Missing companion data. The source document cites
  `R1-sequenced-release-capabilities-table.md` 48 times, and it is **not in this repo**.
  Everything the app knows about capabilities comes from the denormalised text inside the
  mapping file. If that table is later supplied, it supersedes the inline text as the
  capability source — the parser should be structured so that is a swap, not a rewrite.

---

## 8. Technical approach

Follows [`.claude/rules/rules-react-shadcn-tailwind.md`](../.claude/rules/rules-react-shadcn-tailwind.md)
and [`rules-database.md`](../.claude/rules/rules-database.md). No deviation from the
established stack is required or proposed.

| Concern | Approach |
|---|---|
| Ingest | `server/services/scope-parser.ts` → `server/repositories/*` on boot |
| Storage | SQLite (`better-sqlite3`), migrations in `server/migrations/` |
| API | `GET /api/scope` returns the whole graph in one payload; `GET /api/scope/features/:id` for detail |
| Client data | TanStack Query, one query for the graph; all filtering client-side |
| Filter state | URL search params as the single source of truth, read via React Router |
| Map rendering | SVG overlay for edges over a CSS-grid card layout — the grid is 4×8, well within CSS grid's comfort; a graph library is not warranted |
| Styling | Tailwind for the grid and page layout; BEM per [`rules-css-bem.md`](../.claude/rules/rules-css-bem.md) for the feature card, filter rail and detail panel, which are custom components with their own identity |
| Tokens | `src/globals.css` `@theme` only — including release and actor colours |

**No AI, no Anthropic API, no file uploads.** `rules-ai-api.md` does not apply to this app.

### Build order

1. Parser + fixtures + tests (no UI) — until the reconciliation counts are exact, nothing
   downstream is trustworthy.
2. Migrations, repositories, `GET /api/scope`.
3. Static map grid — cards in cells, no filtering, no edges.
4. Filter rail + URL state.
5. Detail panel.
6. Connection edges.
7. Search.
8. Coverage view.
9. Tablet fallback layout.

Steps 1–3 are the walking skeleton and should be demonstrable before anything else starts.

---

## 9. Success criteria

- A stakeholder who has never read the source document can, unaided, state what is in
  MVP 1.2 within 30 seconds of the map loading.
- All five core use cases are completable without leaving the main screen.
- Reconciliation on boot reports exactly 4 releases, 8 phases, 48 features, 39 MVP
  features, 92 capabilities, 92 assumptions, 60 MVP links, 123 capability links.
- Any view can be reproduced from its URL alone.
- Filter response is imperceptible (no spinner, no layout thrash).
- `npm run test`, `npm run lint` and `npm run build` all pass.

## 10. Out of scope for v1

Editing scope · auth and multi-user · comments and annotations · export to PDF or
PowerPoint · Jira or Confluence integration · Release 2+ data · effort estimates and
dates · dependency modelling beyond shared MVP features · diffing two versions of the
source document.

## 11. Future considerations

- **Release 2+.** The source covers Release 1 only. The data model already treats releases
  as rows, so additional releases extend the X axis without a schema change — but the 4-wide
  grid assumption in the map layout should not be hardcoded.
- **The sequenced capabilities table.** If `R1-sequenced-release-capabilities-table.md`
  arrives, capabilities gain their own sequencing and the map could show a capability-level
  timeline beneath the feature-level one.
- **Source-document diffing.** Once scope revisions circulate, "what changed between
  v3 and v4" becomes the highest-value question this app could answer.

---

## 12. Open decisions

Recorded rather than assumed. The build can start on the recommendation in each case; only
D-1 changes the shape of the work.

**D-1 — Read-only, or editable?** *Recommendation: read-only, markdown-as-source.* It keeps
the source document authoritative, avoids a second diverging copy of the scope, and matches
the "simple app" brief. Making scope editable in the app would add auth, concurrency,
write-back or export, and an ownership question about which artefact is true — roughly
tripling the build.

**D-2 — Canonical phase order.** The source has none; the app must impose one. The order
proposed in [§4](#4-data-model) is derived from the sequence phases appear in within each
release. The one genuine ambiguity is Manage Vacancies vs Document Management — Manage
Vacancies precedes it in Release 1.1, but Document Management precedes it in Release 1.2.
Needs a decision from someone who knows the intended employer journey.

**D-3 — Are the near-duplicate capabilities under MVP 941 and 980 intentional?** Treated as
distinct and flagged for review ([R-7.4](#7-data-ingestion--source-of-truth)). If they are
source-document duplication, the parser should merge them and the capability count drops.

**D-4 — Should F-008 and F-029 render as gaps or as deferrals?** The source says their
capabilities are mapped in the Release 1.1–1.3 table (F-008) or under Release 2+ (F-029).
These are different situations and arguably want different treatment in the coverage view.

**D-5 — Stale `CLAUDE.md`.** The product sections of the root `CLAUDE.md` describe an
unrelated project. It should be rewritten for this app before implementation begins,
because it currently instructs future sessions to apply neurodivergent-child accessibility
constraints and an "AI never writes the story" rule that have no bearing here. The
stack and styling rules in `.claude/rules/` are sound and should be kept as-is.
