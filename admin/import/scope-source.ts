import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMappingDocument } from './mapping-parser.js'
import { parseSequencingTable } from './sequencing-parser.js'
import { reconcile, type ReconcileResult } from './reconcile.js'
import {
  applyMvpOptionSplits,
  applyReleaseAliases,
  applyReleaseReallocations,
  applyScopeOverrides,
  applyScopeSplits,
  type AppliedOptionMerge,
  type AppliedOverride,
  type AppliedReallocation,
  type AppliedReleaseAlias,
  type AppliedSplit,
} from './scope-overrides.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const DOCS_DIR = path.join(here, '..', '..', '_docs')

export const MAPPING_PATH = path.join(DOCS_DIR, 'pwc-scope-to-mvp-mapping.md')
export const SEQUENCING_PATH = path.join(
  DOCS_DIR,
  'MSD-R1-sequenced-release-capabilities-table.md',
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
  // 10, not 21: both parsers store the canonical phase name, so the two
  // documents' different words for one phase are no longer a disagreement.
  // Every remaining phase conflict is a genuinely different phase, which is
  // why the two figures are now equal.
  phaseConflicts: 10,
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
 *   phaseConflicts           10 → 7
 *   phaseConflictsAfterMerge 10 → 7
 *
 * OV-003, the 1.9 → 1.4 release alias:
 *   releases                  6 → 5   (1.9 merges into the table's 1.4)
 *   releaseConflicts         34 → 29  (the five 1.9 → 1.4 links agree once the
 *                                      two ids are the same release)
 *
 * OV-004…OV-006, the approved Release 1.1 list:
 *   releaseConflicts         29 → 42  (see below)
 *
 * OV-007/OV-008, the Option A/B split:
 *   mvpRecords               51 → 49  (938 and 946 each lose a bare record to
 *                                      their Option 1A one)
 *
 * The conflict jump is the point of the exercise, not a regression. Moving an
 * MSD feature out of the pilot does not move the PwC features that deliver it:
 * the mapping document still files those under 1.1, so every link between them
 * now straddles the pilot boundary and says so.
 *
 * Release 1.1 holds exactly the twelve approved refs afterwards — none missing
 * and none extra — which is the assertion that matters most here.
 *
 * Link counts are unchanged throughout. A split redistributes links, an alias
 * renames a release, a reallocation moves a capability and an option merge
 * collapses two records that no feature cited together — none adds or drops a
 * link. Phase conflicts are untouched: a release decision says when, not where.
 */
export const EXPECTED_COUNTS = {
  ...EXPECTED_SOURCE_COUNTS,
  releases: 5,
  pwcFeatures: 49,
  mvpRecords: 49,
  releaseConflicts: 42,
  phaseConflicts: 7,
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
 * Release conflict breakdown after every declared correction.
 *
 * `1.4 → 2` (16) is the old 1.9 disagreement, untouched.
 *
 * The rest are mostly the approved Release 1.1 list showing its cost. A PwC
 * feature the mapping document files in the pilot, delivering an MSD feature
 * the programme moved out of it, now disagrees with the table by exactly that
 * move: `1.1 → 1.4` (13, of which 12 are F-001 and F-002 citing ref 938) and
 * `1.1 → 1.2` (8). `1.2 → 1.1` (1) is the mirror — F-086 stays in 1.2 while
 * ref 972 moved into the pilot.
 *
 * `1.4 → 1.1` (3) and `1.3 → 1.2` (1) predate all of this.
 */
export const EXPECTED_RELEASE_CONFLICTS = [
  { from: '1.4', to: '2', links: 16 },
  { from: '1.1', to: '1.4', links: 13 },
  { from: '1.1', to: '1.2', links: 8 },
  { from: '1.4', to: '1.1', links: 3 },
  { from: '1.2', to: '1.1', links: 1 },
  { from: '1.3', to: '1.2', links: 1 },
] as const

/**
 * Parses both real source documents, applies the declared aliases, overrides
 * and splits, and reconciles. All three land before reconciliation so
 * conflicts are derived from the corrected placement.
 */
export function loadScopeFromSources(): ReconcileResult & {
  appliedAliases: AppliedReleaseAlias[]
  appliedOptionMerges: AppliedOptionMerge[]
  appliedOverrides: AppliedOverride[]
  appliedSplits: AppliedSplit[]
  appliedReallocations: AppliedReallocation[]
} {
  const parsed = parseMappingDocument(fs.readFileSync(MAPPING_PATH, 'utf8'))
  // Aliases run first: a placement override or split names the release it
  // wants, and those declarations should read in final ids, not renamed ones.
  const { mapping: aliased, applied: appliedAliases } = applyReleaseAliases(parsed)
  // Option splits next, so every later declaration and every link sees the
  // final MVP record set rather than the loose bare/option mix.
  const { mapping: split, applied: appliedOptionMerges } = applyMvpOptionSplits(aliased)
  const { mapping: overridden, applied: appliedOverrides } = applyScopeOverrides(split)
  // Splits run after placement overrides: a split states each part's placement
  // explicitly, so it supersedes any override on the feature it divides.
  const { mapping, applied: appliedSplits } = applyScopeSplits(overridden)

  const parsedTable = parseSequencingTable(fs.readFileSync(SEQUENCING_PATH, 'utf8'))
  // The table's placement is authoritative except where a programme decision
  // has overruled it — the approved Release 1.1 list (OV-004…OV-006).
  const { sequencing, applied: appliedReallocations } =
    applyReleaseReallocations(parsedTable)

  return {
    ...reconcile(mapping, sequencing),
    appliedAliases,
    appliedOptionMerges,
    appliedOverrides,
    appliedSplits,
    appliedReallocations,
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
