import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMappingDocument } from './mapping-parser.js'
import { parseSequencingTable } from './sequencing-parser.js'
import { reconcile, type ReconcileResult } from './reconcile.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const DOCS_DIR = path.join(here, '..', '..', '_docs')

export const MAPPING_PATH = path.join(DOCS_DIR, 'pwc-scope-to-mvp-mapping.md')
export const SEQUENCING_PATH = path.join(
  DOCS_DIR,
  'R1-sequenced-release-capabilities-table.md',
)

/**
 * The expected reconciliation counts from PRD §6. Drift from these is a bug,
 * not a tolerance — it fails the boot check on import (R-11.3).
 */
export const EXPECTED_COUNTS = {
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

/** Release conflict breakdown from PRD §7. */
export const EXPECTED_RELEASE_CONFLICTS = [
  { from: '1.9', to: '2', links: 16 },
  { from: '1.9', to: '1.1', links: 11 },
  { from: '1.9', to: '1.4', links: 5 },
  { from: '1.3', to: '1.2', links: 2 },
  { from: '1.1', to: '1.4', links: 1 },
] as const

/** Parses and reconciles both real source documents from disk. */
export function loadScopeFromSources(): ReconcileResult {
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
export function findCountDrift(result: ReconcileResult): CountDrift[] {
  const drift: CountDrift[] = []
  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    const typedKey = key as keyof typeof EXPECTED_COUNTS
    const actual = result.summary[typedKey]
    if (actual !== expected) drift.push({ key: typedKey, expected, actual })
  }
  return drift
}
