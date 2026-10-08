---
name: import-scope
description: Re-imports the two PwC source documents in _docs/ (the scope-to-MVP mapping and the sequenced release table) into the MSD VD2 Scope Firestore data. Use when a source document has changed, or when asked to re-import, re-sync or refresh the scope from the sources.
---

Re-import is additive and non-destructive (R-11.4): rows edited in the app
(`source = 'manual'`), resolved conflicts, removed (tombstoned) links and edited
notes are never overwritten. It refuses a graph whose counts drift from the
expected reconciliation (R-11.3), and one whose ids or references don't resolve.

It runs from Node with the Admin SDK (needs `admin/service-account.json` — see
`admin/README.md`), which bypasses the security rules. The owner UID is read from
`firestore.rules`.

## Steps

1. **Back up first** — run the `/backup-db` skill. A re-import cannot be undone
   any other way.

2. **Dry run** — parses the sources, plans the import, writes nothing:
   ```bash
   npm run import-scope
   ```
   Report to the user: the source counts, each collection's written/removed
   counts, and every "drops stale …" / "… — kept" line.

   - **Drift** (`DRIFT …` / `Import aborted — … drifted`): a source document no
     longer reconciles to the expected counts. Stop. The expected counts are
     `EXPECTED_SOURCE_COUNTS` and the post-override counts in
     `admin/import/scope-source.ts`; a deliberate change to a source means
     updating those, reviewed, before importing.
   - **Parse error** or **`Import refused — … point at nothing` / `is not F-nnn`**:
     a source document is malformed. Stop and show the user the message.
   - **`nothing to change`**: done.

3. **Known effects to point out** before applying, if the dry run shows them:
   - Phases: re-import resets imported phases' `display_order` to the
     sources' order. A phase reordered in the app, or a manual phase, can end up
     sharing a position.
   - Capabilities or features deleted in the app but still in the sources are
     re-created (only *links* remember a removal).

4. **Apply** — only after the user confirms the dry run:
   ```bash
   npm run import-scope -- --apply
   ```
   It writes, then reads everything back and verifies. Report the result and
   tell the user to reload the app — an open tab still holds the old data.

To rehearse against the local emulator instead, add `--emulator` (needs
`npm run emulators` running, seeded with `admin/seed-firestore.ts --emulator`).
