import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMappingDocument } from './mapping-parser.js'
import { parseSequencingTable } from './sequencing-parser.js'
import { reconcile, type ReconcileResult } from './reconcile.js'
import {
  applyReleaseAliases,
  applyScopeOverrides,
  applyScopeSplits,
  type AppliedOverride,
  type AppliedReleaseAlias,
  type AppliedSplit,
} from './scope-overrides.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const DOCS_DIR = path.join(here, '..', '..', '_docs')

export const MAPPING_PATH = path.join(DOCS_DIR, 'pwc-scope-to-mvp-mapping.md')
export const SEQUENCING_PATH = path.join(
  DOCS_DIR,
  'R1-sequenced-release-capabilities-table.md',
)

/**
 * The counts for the documents as written, with no overrides — the PRD §6 and
 * §7 figures. Asserted in tests so a declared override can never mask a real
 * change to a source document.
 */
export const EXPECTED_SOURCE_COUNTS = {
  releases: 6,
  phases: 7,
  pwcFeatures: 48,
  assumptions: 92,
  mvpRefs: 48,
  mvpRecords: 51,
  capabilities: 107,
  featureMvpLinks: 60,
  featureCapabilityLinks: 123,
  releaseConflicts: 35,
  phaseConflicts: 21,
  phaseConflictsAfterMerge: 10,
  unmatchedLinks: 2,
} as const

/**
 * The expected counts *after* the declared overrides and splits in
 * scope-overrides.ts. Drift from these is a bug, not a tolerance — it fails
 * the boot check on import (R-11.3).
 *
 * These differ from EXPECTED_SOURCE_COUNTS because of two declared decisions.
 *
 * OV-002, the F-085 split (PRD §16 P-1):
 *   pwcFeatures              48 → 49  (F-085 divided into F-085 + F-093)
 *   releaseConflicts         35 → 34  (both halves now agree with the table)
 *   phaseConflicts           21 → 18
 *   phaseConflictsAfterMerge 10 → 7
 *
 * OV-003, the 1.9 → 1.4 release alias:
 *   releases                  6 → 5   (1.9 merges into the table's 1.4)
 *   releaseConflicts         34 → 29  (the five 1.9 → 1.4 links agree once the
 *                                      two ids are the same release)
 *
 * Link counts are unchanged by either: a split redistributes links and an
 * alias renames a release, and neither adds or drops a link. Phase conflicts
 * are unchanged by the alias, which touches no phase.
 */
export const EXPECTED_COUNTS = {
  ...EXPECTED_SOURCE_COUNTS,
  releases: 5,
  pwcFeatures: 49,
  releaseConflicts: 29,
  phaseConflicts: 18,
  phaseConflictsAfterMerge: 7,
} as const

/** Release conflict breakdown from PRD §7, before overrides. */
export const EXPECTED_SOURCE_RELEASE_CONFLICTS = [
  { from: '1.9', to: '2', links: 16 },
  { from: '1.9', to: '1.1', links: 11 },
  { from: '1.9', to: '1.4', links: 5 },
  { from: '1.3', to: '1.2', links: 2 },
  { from: '1.1', to: '1.4', links: 1 },
] as const

/**
 * Release conflict breakdown after the declared aliases, overrides and splits.
 * The 1.9 rows are the same disagreements under 1.4 (OV-003); the 1.9 → 1.4
 * row is gone because both sides now name one release.
 */
export const EXPECTED_RELEASE_CONFLICTS = [
  { from: '1.4', to: '2', links: 16 },
  { from: '1.4', to: '1.1', links: 11 },
  { from: '1.1', to: '1.4', links: 1 },
  { from: '1.3', to: '1.2', links: 1 },
] as const

/**
 * Parses both real source documents, applies the declared aliases, overrides
 * and splits, and reconciles. All three land before reconciliation so
 * conflicts are derived from the corrected placement.
 */
export function loadScopeFromSources(): ReconcileResult & {
  appliedAliases: AppliedReleaseAlias[]
  appliedOverrides: AppliedOverride[]
  appliedSplits: AppliedSplit[]
} {
  const parsed = parseMappingDocument(fs.readFileSync(MAPPING_PATH, 'utf8'))
  // Aliases run first: a placement override or split names the release it
  // wants, and those declarations should read in final ids, not renamed ones.
  const { mapping: aliased, applied: appliedAliases } = applyReleaseAliases(parsed)
  const { mapping: overridden, applied: appliedOverrides } = applyScopeOverrides(aliased)
  // Splits run after placement overrides: a split states each part's placement
  // explicitly, so it supersedes any override on the feature it divides.
  const { mapping, applied: appliedSplits } = applyScopeSplits(overridden)
  const sequencing = parseSequencingTable(fs.readFileSync(SEQUENCING_PATH, 'utf8'))
  return {
    ...reconcile(mapping, sequencing),
    appliedAliases,
    appliedOverrides,
    appliedSplits,
  }
}

/** Parses and reconciles the sources with NO overrides applied. */
export function loadScopeFromSourcesRaw(): ReconcileResult {
  const mapping = parseMappingDocument(fs.readFileSync(MAPPING_PATH, 'utf8'))
  const sequencing = parseSequencingTable(fs.readFileSync(SEQUENCING_PATH, 'utf8'))
  return reconcile(mapping, sequencing)
}

export type CountDrift = {
  key: keyof typeof EXPECTED_COUNTS
  expected: number
  actual: number
}

/** Returns every count that differs from PRD §6. Empty means no drift. */
export function findCountDrift(
  result: ReconcileResult,
  expectedCounts: Record<string, number> = EXPECTED_COUNTS,
): CountDrift[] {
  const drift: CountDrift[] = []
  for (const [key, expected] of Object.entries(expectedCounts)) {
    const typedKey = key as keyof typeof EXPECTED_COUNTS
    const actual = result.summary[typedKey]
    if (actual !== expected) drift.push({ key: typedKey, expected, actual })
  }
  return drift
}
