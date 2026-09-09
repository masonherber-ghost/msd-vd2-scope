import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMappingDocument } from './mapping-parser.js'
import { parseSequencingTable } from './sequencing-parser.js'
import { reconcile, type ReconcileResult } from './reconcile.js'
import {
  applyScopeOverrides,
  applyScopeSplits,
  type AppliedOverride,
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
 * These differ from EXPECTED_SOURCE_COUNTS because of OV-002, the F-085 split
 * (PRD §16 P-1):
 *   pwcFeatures              48 → 49  (F-085 divided into F-085 + F-093)
 *   releaseConflicts         35 → 34  (both halves now agree with the table)
 *   phaseConflicts           21 → 18
 *   phaseConflictsAfterMerge 10 → 7
 *
 * Link counts are unchanged: a split redistributes links, it never adds or
 * drops any.
 */
export const EXPECTED_COUNTS = {
  ...EXPECTED_SOURCE_COUNTS,
  pwcFeatures: 49,
  releaseConflicts: 34,
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

/** Release conflict breakdown after the declared overrides and splits. */
export const EXPECTED_RELEASE_CONFLICTS = [
  { from: '1.9', to: '2', links: 16 },
  { from: '1.9', to: '1.1', links: 11 },
  { from: '1.9', to: '1.4', links: 5 },
  { from: '1.1', to: '1.4', links: 1 },
  { from: '1.3', to: '1.2', links: 1 },
] as const

/**
 * Parses both real source documents, applies the declared overrides, and
 * reconciles. Overrides land before reconciliation so conflicts are derived
 * from the corrected placement.
 */
export function loadScopeFromSources(): ReconcileResult & {
  appliedOverrides: AppliedOverride[]
  appliedSplits: AppliedSplit[]
} {
  const parsed = parseMappingDocument(fs.readFileSync(MAPPING_PATH, 'utf8'))
  const { mapping: overridden, applied: appliedOverrides } = applyScopeOverrides(parsed)
  // Splits run after placement overrides: a split states each part's placement
  // explicitly, so it supersedes any override on the feature it divides.
  const { mapping, applied: appliedSplits } = applyScopeSplits(overridden)
  const sequencing = parseSequencingTable(fs.readFileSync(SEQUENCING_PATH, 'utf8'))
  return { ...reconcile(mapping, sequencing), appliedOverrides, appliedSplits }
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
