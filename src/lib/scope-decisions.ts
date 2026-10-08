/**
 * The declared decisions the scope graph exposes alongside its data, so a
 * corrected placement or a merged release is visible in the UI rather than
 * looking like source data. Shared by the importer (which applies them) and
 * the browser (which shows them).
 */

/**
 * Deliberate corrections to the source documents.
 *
 * The markdown files are inputs from PwC and are never edited — falsifying a
 * source would destroy the provenance the whole app exists to expose. A
 * correction is declared here instead and re-applied on every import, so it
 * survives a rebuilt database, is visible in version control, and can be
 * reversed by deleting one entry.
 *
 * Overrides are applied *before* reconciliation, so conflicts are derived from
 * the corrected placement rather than left stale.
 */
export type ScopeOverride = {
  id: string
  featureId: string
  releaseId?: string
  phaseLabel?: string
  rationale: string
  decidedOn: string
}

export const SCOPE_OVERRIDES: readonly ScopeOverride[] = [
  // OV-001 (F-085 → Manage Vacancies / 1.1) was superseded by the OV-002 split
  // below, which places both halves explicitly. Recorded here rather than
  // deleted so the decision trail stays readable.
]

/**
 * A release rename. The mapping document files 15 features under "Release 1.9
 * (MVP1.9 / GA & Scale-Up)", an id the sequencing table has never heard of —
 * it sequences those same capabilities under 1.4 and 2. An alias declares that
 * the two documents are naming one release, so the mapping's id is rewritten
 * to the table's before reconciliation.
 *
 * `to` may already exist in either source: the alias merges into it rather
 * than creating a duplicate, and any conflict that becomes self-referential
 * (from and to now equal) stops being a conflict.
 */
export type ReleaseAlias = {
  id: string
  from: string
  to: string
  /** Label for the merged release. Defaults to `Package ${to}`. */
  label?: string
  rationale: string
  decidedOn: string
}

export const RELEASE_ALIASES: readonly ReleaseAlias[] = [
  {
    id: 'OV-003',
    from: '1.9',
    to: '1.4',
    rationale:
      'Package 1.9 is a mapping-file construct with no column in the sequencing table, ' +
      'so every one of its 32 capability links conflicted and no capability anywhere was ' +
      'sequenced as 1.9. The table schedules 5 of those links in 1.4 — the package that ' +
      'had capabilities but no features. Treating 1.9 and 1.4 as one package is the only ' +
      'reading under which both documents describe the same plan: it clears those 5 ' +
      'conflicts and leaves the 27 that are genuine disagreements about 1.1 and 2.',
    decidedOn: '2026-09-11',
  },
]
