# QA scenarios

What should be true about this app, written so someone who has never seen the code can
execute it. One `##` section per page or feature. Sections are updated in place, never
rewritten wholesale.

**How to read this**

- **Coverage** is one of `automated` (a named Vitest test proves it), `manual` (real-browser
  only — layout, overflow, rendered contrast, touch-target size, focus appearance) or
  `gap` (should be automated and is not).
- **Priority** is `P1` critical journey · `P2` important · `P3` edge.
- IDs are stable and never reused. A retired scenario is struck through, not deleted.
- Product rules live in [`PRD.md`](PRD.md); where this file and the PRD disagree, the PRD wins.

---

## MSD feature detail panel — capabilities it owns

**Route:** `/?view=mvp&selectedMvp=:id` · **Source:** `src/components/MvpDetailPanel.tsx`, wired in `src/pages/ScopeMap.tsx` ·
**Tests:** `src/components/MvpDetailPanel.test.tsx`, `src/pages/ScopeMap.test.tsx`, `server/routes/entity-routes.test.ts`, `server/repositories/entity-crud.test.ts`
**Brief:** "View By MSD Feature: need to be able to edit the capabilities in the details panel (same as how it is done on the PwC feature detail)" — resolved as reassigning which capabilities the record *owns* (`capabilities.mvp_feature_id`), via the same LinkPicker interaction the PwC panel uses. Server path `PUT /api/mvp-features/:id/capabilities`.
**Also covers:** "Need to be able to edit the title of the MSD feature in the detail panel when you tap the title" — `PATCH /api/mvp-features/:id`, the same in-place heading edit the capability panel uses.
**Also covers:** "Need to be able to re-assign an MSD feature to a release" — resolved as moving the capabilities the record owns, since neither source gives an MSD feature a placement of its own. Release and stage move independently. Server path `PUT /api/mvp-features/:id/placement`. ·
**Last reviewed:** 2026-09-18

### Assumptions
- "Edit the capabilities" means **re-owning** existing capabilities, not creating, renaming or
  deleting them from this panel. Creating is done from `/manage/capabilities`; renaming and
  deleting from the capability panel.
- A capability may be claimed by a record under a **different** `mvp_ref`. The picker offers all
  107 capabilities and marks the ones outside this record's ref as unrelated, so this is
  deliberate. `mvp_ref` is left untouched, which means such a capability still filters under its
  original ref in the capability view (see MDP-14).
- Unticking leaves the capability ownerless rather than deleting or moving it — stated in the
  panel and enforced in the repository.
- `mvp_owner_ambiguous` clearing and `source` becoming `manual` apply only to rows that actually
  change owner; re-saving an unchanged set writes nothing.
- No optimistic UI here: the whole graph is invalidated and refetched after the write, because a
  change of owner can move the card to a different cell (R-9.6's rollback requirement is met by
  there being nothing local to roll back).

### Traceability
| ID | Scenario | Priority | Coverage | Covered by |
|----|----------|----------|----------|-----------|
| MDP-01 | The lookup stays closed until asked for | P2 | automated | `ScopeMap.test.tsx` › stays closed until the shown capability is tapped |
| MDP-02 | A record owning nothing offers to assign, not change | P2 | automated | `ScopeMap.test.tsx` › offers to assign, not change, on a record that owns nothing |
| MDP-03 | The lookup offers every capability and says who owns each | P1 | automated | `ScopeMap.test.tsx` › offers every capability, saying which record owns each one |
| MDP-04 | Ticking sends the complete new set to the server | P1 | automated | `ScopeMap.test.tsx` › sends the complete new set when a capability is claimed |
| MDP-05 | The claimed capability appears under its new record without a reload | P1 | automated | `ScopeMap.test.tsx` › shows the claimed capability under its new record without a reload |
| MDP-06 | The record that owned it before loses it | P1 | automated | `ScopeMap.test.tsx` › takes it off the record that owned it before |
| MDP-07 | Unticking leaves the capability on the map, owned by nothing | P1 | automated | `ScopeMap.test.tsx` › unticking leaves the capability on the map, owned by nothing |
| MDP-08 | A rejected save surfaces the server's own message and changes nothing | P2 | automated | `ScopeMap.test.tsx` › surfaces the server's refusal and keeps the record as it was |
| MDP-09 | An open lookup is abandoned when another record is selected | P3 | automated | `MvpDetailPanel.test.tsx` › closes an open editor when another record arrives |
| MDP-10 | The panel is read-only where no edit handler is supplied | P3 | automated | `MvpDetailPanel.test.tsx` › lists them as plain text when there is no edit handler |
| MDP-11 | The server replaces the owned set and answers with it | P1 | automated | `entity-routes.test.ts` › replaces the owned set and answers with what the record now owns |
| MDP-12 | An empty set leaves every capability ownerless, not deleted | P1 | automated | `entity-routes.test.ts` › an empty set leaves every capability ownerless rather than deleted · `entity-crud.test.ts` › leaves a dropped capability ownerless rather than deleting it |
| MDP-13 | `mvp_ref` survives a change of owner | P2 | automated | `entity-crud.test.ts` › keeps mvp_ref — the ref is what the document cited, not the owner |
| MDP-14 | A capability owned across refs still filters under its original ref | P3 | gap | — (behaviour confirmed by reading `capability-derive.ts`; intended, undocumented in the UI) |
| MDP-15 | Re-saving an unchanged set leaves an imported row importable | P2 | automated | `entity-crud.test.ts` › re-saving the same set leaves an imported row importable |
| MDP-16 | The rule-chosen owner flag clears once a person states the owner | P2 | automated | `entity-crud.test.ts` › clears the rule-chosen flag, because a person has now stated the owner |
| MDP-17 | An unknown MSD record is refused by name, writing nothing | P2 | automated | `entity-routes.test.ts` › refuses an unknown MSD feature by name, writing nothing |
| MDP-18 | A non-integer id is refused before it reaches the database | P3 | automated | `entity-routes.test.ts` › refuses a non-integer id before it reaches the database |
| MDP-19 | An unknown capability id is named and the whole set rejected | P2 | automated | `entity-routes.test.ts` › names a capability id that does not exist and changes nothing |
| MDP-20 | A malformed body is rejected | P3 | automated | `entity-routes.test.ts` › rejects a body that is not a list of ids |
| MDP-21 | The lookup opens from the keyboard alone | P1 | automated | `MvpDetailPanel.test.tsx` › opens the lookup from the keyboard alone |
| MDP-22 | Focus is not lost when the lookup replaces the trigger | P1 | automated | `MvpDetailPanel.test.tsx` › keeps focus inside the panel when the lookup replaces the button · › returns focus to the trigger when the lookup is dismissed — fixed: the picker takes focus on open (`autoFocus`), the trigger takes it back on Done |
| MDP-23 | A save in flight is visibly pending and announced | P2 | gap | — (the picker disables every checkbox and says nothing; see also MDP-24) |
| MDP-24 | Focus survives the checkboxes being disabled during a save | P2 | gap | — (pre-existing `LinkPicker` behaviour, now reachable from this panel too) |
| MDP-25 | The ownership hint on an unrelated option meets AA contrast | P1 | manual | browser check — the `opacity: 0.72` that took the muted hint to 3.07:1 is gone; an unrelated option is now marked with a side rule, leaving the hint at its full 5.46:1 |
| MDP-26 | A 107-item lookup and a long capability text do not break the panel | P3 | manual | browser check |
| MDP-27 | The lookup is usable at tablet width with the panel beside the map | P2 | manual | browser check (R-10.5) |
| MDP-28 | A second listed capability does not shut the lookup | P2 | automated | `MvpDetailPanel.test.tsx` › stays open when a second listed capability is tapped |
| MDP-29 | Re-assigning the record moves the capabilities it owns | P1 | automated | `MvpDetailPanel.test.tsx` › moves the record by moving what it owns · `ScopeMap.test.tsx` › re-assigns the record to a release by moving what it owns · `entity-routes.test.ts` › moves the capabilities the record owns, and says how many |
| MDP-30 | Moving the release leaves each capability in its own stage | P1 | automated | `entity-crud.test.ts` › leaves a straddle on the other axis alone |
| MDP-31 | The stage moves with the label a phase conflict is measured on | P2 | automated | `entity-routes.test.ts` › moves the stage and the label that a phase conflict is measured on |
| MDP-32 | A move re-judges the conflict on every feature citing what moved | P1 | automated | `entity-routes.test.ts` › re-judges the conflict on a feature citing what moved |
| MDP-33 | A record with nothing to move is refused, and told what places it | P2 | automated | `entity-routes.test.ts` › refuses a record with nothing to move, and says what places it · `MvpDetailPanel.test.tsx` › offers no placement editor when the record owns nothing to move |
| MDP-34 | A straddling record reads "Mixed", not one of its releases | P2 | automated | `MvpDetailPanel.test.tsx` › says a straddling record is mixed rather than naming one release |
| MDP-35 | A capability another record owns is never moved | P1 | automated | `entity-crud.test.ts` › never touches a capability another record owns · `entity-routes.test.ts` › leaves a capability the record does not own where it is |
| MDP-36 | Re-saving the same placement writes nothing | P2 | automated | `entity-crud.test.ts` › writes nothing for a row already there, leaving it importable |
| MDP-37 | The moved record appears in its new cell without a reload | P1 | automated | `ScopeMap.test.tsx` › shows the record in its new release without a reload |
| MDP-38 | A rejected move surfaces the server's message in place | P2 | automated | `MvpDetailPanel.test.tsx` › surfaces the server's refusal in place · `entity-routes.test.ts` › refuses a release that does not exist, moving nothing |
| MDP-39 | The title is renamed by clicking it | P1 | automated | `MvpDetailPanel.test.tsx` › makes the title itself the control when there is · › passes the trimmed title to the handler · `ScopeMap.test.tsx` › renames the record from its title, and shows the new name at once |
| MDP-40 | A rename that saves nothing new does not call the server | P3 | automated | `MvpDetailPanel.test.tsx` › does not call the handler when nothing changed |
| MDP-41 | A failed rename keeps the typing and shows why | P2 | automated | `MvpDetailPanel.test.tsx` › keeps the typing and surfaces the server's refusal when a save fails |

### Scenarios
#### MDP-03 — The lookup offers every capability and says who owns each · P1
**Given** the MSD feature view is open and record 948 · 1B is selected
**When** the user opens the capability lookup
**Then** every capability in the scope appears, each labelled with its ref, actor and current
owner — "this record", "no MSD feature", or "owned by 938" — so claiming one shows what it costs
the record that has it.

#### MDP-05 — The claimed capability appears under its new record without a reload · P1
**Given** capability "Invite employer to register" is owned by record 938
**When** the user ticks it in record 948 · 1B's lookup
**Then** 948 · 1B's panel immediately reads "Capabilities (2)" with the capability listed and
ticked, with no page reload.

#### MDP-07 — Unticking leaves the capability on the map, owned by nothing · P1
**Given** record 938 owns two capabilities
**When** the user unticks "Invite employer to register"
**Then** the record owns one, and the capability is still on the capability view's map — it has
lost an owner, not been deleted or moved.

#### MDP-25 — The ownership hint on an unrelated option meets AA contrast · P1
**Given** MSD record 948 · 1B, whose ref carries one of the 107 capabilities
**When** the user opens the capability lookup
**Then** the ownership hint on every option — "938 · staff · owned by 938", which is the whole
basis for deciding whether to claim it — is legible at WCAG AA contrast, not dimmed below it.

#### MDP-22 — Focus is not lost when the lookup replaces the trigger · P1
**Given** a keyboard-only user on an MSD feature panel
**When** they activate "Change capabilities"
**Then** focus moves into the lookup that just opened, rather than falling to `<body>` and
forcing a tab from the top of the document — and returns to the trigger when the lookup is
dismissed, unless a different record closed it.

#### MDP-29 — Re-assigning the record moves the capabilities it owns · P1
**Given** MSD feature 941, whose four capabilities all sit in Release 1.1
**When** the user edits Release on its panel to 1.4
**Then** all four capabilities move to 1.4, the card appears in 1.4 without a reload, and each
keeps the stage it was in — the record has no release of its own, so moving it is moving them.

#### MDP-32 — A move re-judges the conflict on every feature citing what moved · P1
**Given** capability "CIAM authentication" in Release 1.1, cited by F-006 which also ships in 1.1
**When** the record owning it is re-assigned to Release 1.4
**Then** F-006's link is re-judged and now reports a release conflict — one placement is shared by
every feature citing it, so a move can create a disagreement as easily as settle one.

#### MDP-33 — A record with nothing to move is refused, and told what places it · P1
**Given** MSD feature 937, which owns no capability and is placed by the PwC features citing it
**When** a move is attempted
**Then** the panel offers no placement editor at all, and the endpoint answers 409 naming why —
never a silent success that moves nothing.

#### MDP-28 — A second listed capability does not shut the lookup · P2
**Given** record 938, which owns two capabilities, with the lookup opened by tapping the first
**When** the user taps the second
**Then** the lookup stays open: every row points at the one editor, so a row opens it and never
toggles it.

---

## Capability detail panel — delete, and reaching what it links to

**Route:** `/?view=capability&selectedCapability=:id` · **Source:** `src/components/CapabilityDetailPanel.tsx`, wired in `src/pages/ScopeMap.tsx` ·
**Tests:** `src/components/CapabilityDetailPanel.test.tsx`, `src/pages/ScopeMap.test.tsx`, `server/routes/entity-routes.test.ts`
**Brief:** "Capabilities detail: need to be able to delete the capability; need to be able to click through the features listed to view that feature details" — delete is a confirm-then-delete cascading the PwC citations where any exist (`DELETE /api/capabilities/:id?cascade=true`); the owning MSD feature block opens that record in the MSD-feature view. ·
**Last reviewed:** 2026-09-18

### Assumptions
- "The features listed" covers both the PwC citation rows (already click-through before this
  change) and the owning MSD feature block (added by it).
- A capability nothing cites deletes in one confirmed step; a cited one needs the cascade, which
  removes the citation rows and any conflict decision recorded against them but keeps the PwC
  features themselves. This mirrors the PwC feature delete (R-9.4, R-9.5).
- Deleting from this panel closes the panel and clears `selectedCapability` from the URL,
  because there is nothing left to show.
- Placement stays non-editable here: it is decided from the feature whose conflict it causes.

### Traceability
| ID | Scenario | Priority | Coverage | Covered by |
|----|----------|----------|----------|-----------|
| CDP-01 | Delete names the capability and the citations that go with it, before deleting anything | P1 | automated | `ScopeMap.test.tsx` › names the citation that goes with it before anything is deleted · `CapabilityDetailPanel.test.tsx` › names the citations that go with it before deleting anything |
| CDP-02 | Cancelling the confirmation deletes nothing | P1 | automated | `ScopeMap.test.tsx` › cancelling deletes nothing |
| CDP-03 | Confirming cascades, removes the card and closes the panel | P1 | automated | `ScopeMap.test.tsx` › cascades the citations, removes the card and closes the panel |
| CDP-04 | A capability nothing cites deletes without a cascade | P2 | automated | `ScopeMap.test.tsx` › asks for no cascade when nothing cites it · `CapabilityDetailPanel.test.tsx` › does not cascade when nothing cites it |
| CDP-05 | A refused delete surfaces the server's message and keeps the capability | P2 | automated | `ScopeMap.test.tsx` › surfaces the server's refusal and keeps the capability |
| CDP-06 | A pending confirmation is abandoned when another capability is selected | P3 | automated | `CapabilityDetailPanel.test.tsx` › abandons a pending confirmation when another capability arrives |
| CDP-07 | The panel offers no delete where no handler is supplied | P3 | automated | `CapabilityDetailPanel.test.tsx` › offers no delete without a handler |
| CDP-08 | A delete in flight is visibly pending and cannot be submitted twice | P2 | automated | `CapabilityDetailPanel.test.tsx` › shows it is working and cannot be submitted twice |
| CDP-09 | The server refuses a cited capability, naming how many cite it | P1 | automated | `entity-routes.test.ts` › refuses a cited capability, naming how many cite it, and keeps it |
| CDP-10 | Omitting the cascade entirely is refused the same way | P2 | automated | `entity-routes.test.ts` › refuses it just the same when the cascade is not mentioned at all |
| CDP-11 | The cascade removes the citation rows and keeps the PwC features | P1 | automated | `entity-routes.test.ts` › removes the citations with it once the cascade is confirmed, keeping the feature |
| CDP-12 | Deleting an unknown capability reports it rather than no-op | P3 | automated | `entity-routes.test.ts` › reports an unknown capability rather than a silent no-op |
| CDP-13 | A cascade value that is neither true nor false is rejected | P3 | automated | `entity-routes.test.ts` › rejects a cascade value that is neither true nor false |
| CDP-14 | The owning MSD record opens in the MSD-feature view, from the URL | P1 | automated | `ScopeMap.test.tsx` › opens the owning MSD record from the capability panel |
| CDP-15 | A citing PwC feature opens in the feature view | P1 | automated | `ScopeMap.test.tsx` › jumps from a capability to the feature citing it |
| CDP-16 | A capability whose ref resolved to no MSD record says so instead of offering a dead control | P3 | gap | — (only the no-handler case is covered, by `CapabilityDetailPanel.test.tsx` › leaves the MSD feature as plain text with no handler) |
| CDP-17 | The delete journey completes from the keyboard alone | P1 | automated | `CapabilityDetailPanel.test.tsx` › reaches and opens the confirmation from the keyboard alone |
| CDP-18 | Focus is not lost when the confirmation replaces the delete button | P1 | automated | `CapabilityDetailPanel.test.tsx` › keeps focus inside the panel when the confirmation replaces the button — fixed: focus moves to the confirmation text |
| CDP-19 | Cancelling returns focus to the delete control | P1 | automated | `CapabilityDetailPanel.test.tsx` › returns focus to the delete control when the confirmation is cancelled — fixed |
| CDP-20 | The confirmation is announced to a screen reader when it appears | P2 | manual | browser check with a screen reader — focus now lands on the confirmation text, which states what will be deleted before the buttons that do it |
| CDP-21 | The same capability cannot be deleted from `/manage/capabilities` when cited, and the message is actionable there | P3 | gap | — (the 409 tells the user to confirm a cascade that page offers no control for) |
| CDP-22 | Delete and the click-through targets meet the minimum touch target and have visible focus | P2 | manual | browser check |
| CDP-23 | A long capability text inside the confirmation sentence does not break the panel | P3 | manual | browser check |
| CDP-24 | The panel and its delete are reachable at tablet width | P2 | manual | browser check (R-10.5) |

### Scenarios
#### CDP-01 — Delete names what goes with it, before deleting anything · P1
**Given** capability "Electronic T&Cs acceptance", cited by F-002
**When** the user opens its panel and chooses "Delete this capability"
**Then** a confirmation appears naming the capability and saying the citation from F-002 and any
conflict decision recorded against it go too, that F-002 itself is kept, and that a re-import
would bring the capability back — and nothing is deleted until it is confirmed.

#### CDP-03 — Confirming cascades, removes the card and closes the panel · P1
**Given** the confirmation is showing for a cited capability
**When** the user chooses "Delete and remove those citations"
**Then** the server is asked to cascade, the capability's card leaves the map, the panel closes,
and `selectedCapability` is cleared from the URL.

#### CDP-14 — The owning MSD record opens in the MSD-feature view · P1
**Given** capability "Electronic T&Cs acceptance", owned by MSD record 948 · 1B
**When** the user clicks the MSD feature block on its panel
**Then** the map switches to the MSD-feature view with 948 · 1B's panel open, and the URL reads
`view=mvp&selectedMvp=3` with `selectedCapability` removed — so the link reproduces the view.

#### CDP-18 — Focus is not lost when the confirmation replaces the delete button · P1
**Given** a keyboard-only user on a capability panel
**When** they activate "Delete this capability"
**Then** focus moves into the confirmation, rather than falling to `<body>` and forcing a tab
from the top of the document to reach the confirm and cancel controls they just asked for.

---

## Scope Map — Markdown export of the current view

**Route:** `/` (all four views) · **Source:** `src/lib/scope-export.ts`, `src/components/ScopeExportDialog.tsx`, toolbar button in `src/pages/ScopeMap.tsx` ·
**Tests:** `src/lib/scope-export.test.ts`, `src/components/ScopeExportDialog.test.tsx`, `src/pages/ScopeMap.test.tsx`
**Brief:** "Create a button that generates a formatted text list of the view in .md format. Based on the format in the doc `_inputs/VD1 features list scope.md` and allows for export in .md format." Confirmed: (1) the export is the **current view plus its active filters** — exactly what is on screen; (2) the button opens a **preview dialog** with Copy and Download .md. ·
**Last reviewed:** 2026-09-24 (reviewed, then fixed and re-verified the same day)

### Assumptions
- The source document `_inputs/VD1 features list scope.md` fixes the *structure* — `# Scope for VD2`,
  a "Including releases…" line, a "View by…" line, `##` release sections, `####` phase headings
  carrying the epic ref, one bullet per record — not its exact wording. The build reorders the
  release heading (`1. Release 1.1 — Pilot` where the source reads `1. Pilot 1.1`) and makes the
  source's stray `# Release 2` an `##` like every other release. Both read as improvements and are
  accepted.
- The source's Google-Docs escaping (`1\.`, `\-`) and trailing double-spaces are export artefacts,
  not format requirements. Not reproduced, correctly.
- "The current view" means the cards the view is showing, filed the way the view files them. A
  capability needs both a release and a phase to reach a cell, so one missing either is unplaced
  on screen *and* in the export — the document and the map agree on what is on the map. Settled
  under SX-34; the export previously split the two cases.
- No dark theme exists in this app, so contrast is judged against the single token set in
  `src/globals.css`.
- Hardcoded `font-size` values in `ScopeExportDialog.css` match established practice across all 20+
  component CSS files (there are no type tokens in `@theme`), so they are not counted against this
  build.

### Traceability
| ID | Scenario | Priority | Coverage | Covered by |
|----|----------|----------|----------|-----------|
| SX-01 | The export is offered from the toolbar and stays closed until asked for | P1 | automated | `ScopeMap.test.tsx` › offers the export from the toolbar, closed until asked for |
| SX-02 | The dialog shows the current view as Markdown in the source document's shape | P1 | automated | `ScopeMap.test.tsx` › shows the current view as Markdown, in the source document's shape |
| SX-03 | Switching view changes what is exported | P1 | automated | `ScopeMap.test.tsx` › follows the view, so switching tab changes what is exported |
| SX-04 | Active filters narrow the export, and the document states the narrowing in words | P1 | automated | `ScopeMap.test.tsx` › exports only what the filters left on the map · `scope-export.test.ts` › states the narrowing in words so the list is not read as the whole scope |
| SX-05 | The file is named after the view it was taken from | P2 | automated | `ScopeMap.test.tsx` › names the file after the view it was taken from · `scope-export.test.ts` › names the file after the view |
| SX-06 | Copy puts the whole document on the clipboard and confirms it | P1 | automated | `ScopeExportDialog.test.tsx` › copies the markdown and confirms it |
| SX-07 | A blocked clipboard gives an actionable instruction, not a silent failure | P2 | automated | `ScopeExportDialog.test.tsx` › tells the reader what to do when the clipboard is blocked |
| SX-08 | Download saves the document under the view's filename | P1 | automated | `ScopeExportDialog.test.tsx` › saves the markdown under the document filename |
| SX-09 | The file is offered as `text/markdown` and the blob URL is released | P2 | automated | `ScopeExportDialog.test.tsx` › offers the file as markdown, not as plain text |
| SX-10 | A release section carries its number, label and name; the label alone where there is no name | P2 | automated | `scope-export.test.ts` › heads each release section with its number, label and name · › falls back to the label alone |
| SX-11 | A phase heading carries its epic ref, as the source document does | P1 | automated | `scope-export.test.ts` › heads each phase with its epic, as the source document does |
| SX-11b | A phase with no epic ref is headed by its name alone, with no empty parenthetical | P2 | automated | `scope-export.test.ts` › heads a phase with no epic by its name alone |
| SX-12 | Phases run in journey order; a phase nothing lands in is omitted | P2 | automated | `scope-export.test.ts` › orders phases by the journey · › omits a phase nothing lands in · › omits a release nothing lands in |
| SX-13 | Actor view repeats a feature under each actor and counts records, not bullets | P2 | automated | `scope-export.test.ts` › groups by actor in actor view · › counts records rather than bullets |
| SX-14 | A record no source places is listed rather than dropped | P2 | automated | `scope-export.test.ts` › lists an unplaced MSD feature rather than dropping it · `ScopeMap.test.tsx` › carries a record the map itself lists as unplaced |
| SX-15 | An empty result explains itself instead of printing bare headings | P2 | automated | `scope-export.test.ts` › explains an empty result instead of returning bare headings |
| SX-16 | An empty map with **no** filters set does not tell the reader to clear a filter | P2 | automated | `scope-export.test.ts` › does not blame a filter that was never set when the map is simply empty · `ScopeMap.test.tsx` › explains an empty map without blaming a filter nobody set |
| SX-17 | Actor view narrows its release span to what the filters left, like every other view | P2 | automated | `scope-export.test.ts` › narrows the release span in actor view too |
| SX-18 | The span line does not claim a release the export skipped | P3 | automated | `scope-export.test.ts` › does not span a release the export skipped |
| SX-19 | A capability whose text or question runs to more than one line stays on one bullet | P3 | automated | `scope-export.test.ts` › keeps a capability whose text runs to more than one line on one bullet |
| SX-20 | Closing the dialog returns focus to the Export control | P1 | automated | `ScopeMap.test.tsx` › returns focus to the Export control when the dialog closes |
| SX-21 | Dismissing with Escape returns focus to the Export control | P1 | automated | `ScopeMap.test.tsx` › returns focus to the Export control when the dialog is dismissed with Escape |
| SX-22 | The export opens and closes from the keyboard alone | P1 | automated | `ScopeMap.test.tsx` › opens and closes the export from the keyboard alone |
| SX-23 | The dialog names itself, and the copy is announced rather than signalled by icon alone | P2 | automated | `ScopeExportDialog.test.tsx` › names itself · › announces the copy rather than signalling it with an icon alone |
| SX-24 | Tab order runs preview → Close → Copy → Download | P2 | automated | `ScopeExportDialog.test.tsx` › reaches both ways out of the dialog from the keyboard |
| SX-25 | A blocked-copy message clears once a copy succeeds | P3 | automated | `ScopeExportDialog.test.tsx` › clears the blocked-copy message once a copy succeeds |
| SX-26 | The blocked-copy message meets AA text contrast | P2 | **manual — fails by measurement** | `--color-destructive` on `--color-background` = **3.01:1** at 13px regular; AA needs 4.5:1 |
| SX-27 | The preview's boundary is distinguishable from the dialog behind it | P3 | manual | border `1.35:1`, fill `1.08:1` against the dialog background — browser check against WCAG 1.4.11 |
| SX-28 | The toolbar still exposes every control at tablet and phone width now Export is in it | P2 | manual | browser check — the button row does not wrap (`flex items-center gap-2`) |
| SX-29 | No export is offered while the scope failed to load | P3 | automated | `ScopeMap.test.tsx` › offers no export while the scope failed to load |
| SX-30 | The preview shows the document's own line breaks rather than soft-wrapping them | P3 | manual | browser check (`white-space: pre`, horizontal scroll) |
| SX-31 | The preview and the three actions show a visible focus ring | P2 | manual | browser check |
| SX-32 | Two exports of the same view under different filters are distinguishable as files | P3 | automated | `scope-export.test.ts` › marks a filtered export in its filename |
| SX-33 | Markdown-significant characters in a record's name do not change how the bullet renders | P3 | gap | — `*`, `_` and `` ` `` in a title pass through unescaped |
| SX-34 | A capability with a release but no phase is filed the same way on screen and in the export | P3 | automated | `scope-export.test.ts` › files a capability missing a phase where the map files it — off the map |

### Scenarios

#### SX-04 — The export is the screen, filters and all · P1
**Given** the Scope Map in the PwC-release view, filtered to feature F-001
**When** the user presses Export
**Then** the preview lists F-001 and no other feature, and a line near the top reads
`Filtered by — PwC feature: F-001`, so the list cannot be mistaken for the whole scope.

#### SX-16 — An empty map does not blame a filter nobody set · P2
**Given** a scope with no records at all, and no filters active
**When** the user presses Export
**Then** the document says the map is empty — not "No PwC features match the current filters.
Clearing a filter will bring some back", which names a cause that does not exist and offers an
action the user cannot take.
**Fixed:** the message branches on `isEmpty(filters)` and reads "There are no … to export — the map
itself is empty."

#### SX-17 — A filtered export claims no more than it holds · P2
**Given** the actor view, filtered to Release 1.1
**When** the user presses Export
**Then** the "Including releases…" line names 1.1 alone.
**Fixed:** `releasesCovered` reads actor view's span off the features being listed rather than off
the release table, so every view answers the question from the document's own contents.

#### SX-18 — The span line does not cover a release the export skipped · P3
**Given** five releases (1.1 … 2) and a filter leaving only 1.1 and 2 on the map
**When** the user presses Export
**Then** the header names the releases the document covers.
**Fixed:** `spanLine` uses a range only where the releases are contiguous in the release table, and
lists them otherwise — `Including releases 1.1, 2`.

#### SX-19 — A wrapped capability stays one bullet · P3
**Given** a capability whose text was edited in the panel's textarea to run over two lines
**When** the view is exported
**Then** the bullet holds the whole text.
**Fixed:** every field going into a bullet passes through `oneLine`, which collapses runs of
whitespace — a bullet is one line, so what goes in one has to be.

#### SX-20 / SX-21 — The export returns the keyboard user where they were · P1
**Given** a keyboard user who opened the export from the toolbar
**When** they close it, with Close or with Escape
**Then** focus returns to the Export button.
**Cause:** `<Dialog>` is driven by external state with no `DialogTrigger`, and Radix's
`onCloseAutoFocus` prevents the default restore in favour of focusing a trigger that does not
exist, so focus fell to `<body>`.
**Fixed:** the page passes the toolbar button's ref as `returnFocusRef` and the dialog's
`onCloseAutoFocus` focuses it.
**Still open, not this feature:** `CapabilityResolutionModal` is mounted the same way
(`src/components/FeatureDetailPanel.tsx`) and has the same behaviour.

#### SX-26 — The one error message in the feature is legible · P2
**Given** a browser where clipboard access is refused (insecure context, or permission denied)
**When** the user presses Copy Markdown
**Then** the explanation is readable. Observed: `.scope-export__error` renders
`var(--color-destructive)` on `var(--color-background)` at 13px regular — **3.01:1**, below the
4.5:1 AA minimum. The token is shared with eight other components, so the fix is a token change,
not a change to this dialog. **Open** — left for a decision on the token rather than fixed here.
