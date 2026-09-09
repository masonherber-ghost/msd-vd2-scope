import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMappingDocument } from './mapping-parser.js'
import { parseSequencingTable } from './sequencing-parser.js'
import { reconcile } from './reconcile.js'
import { ParseError } from './scope-types.js'
import {
  EXPECTED_COUNTS,
  EXPECTED_RELEASE_CONFLICTS,
  MAPPING_PATH,
  SEQUENCING_PATH,
  findCountDrift,
  loadScopeFromSources,
} from './scope-source.js'

const result = loadScopeFromSources()

describe('the real source documents reconcile to the PRD counts', () => {
  it('has no count drift from PRD §6', () => {
    // Reported as a list so a failure names every drifted metric at once.
    expect(findCountDrift(result)).toEqual([])
  })

  it.each(Object.entries(EXPECTED_COUNTS))('%s is %i', (key, expected) => {
    expect(result.summary[key as keyof typeof EXPECTED_COUNTS]).toBe(expected)
  })

  it('breaks release conflicts down exactly as PRD §7 does', () => {
    expect(result.summary.releaseConflictBreakdown).toEqual([...EXPECTED_RELEASE_CONFLICTS])
  })

  it('resolves 11 of the 21 phase conflicts via the canonical merge', () => {
    const merged = result.conflicts.phase.filter((c) => c.resolvedByCanonicalMerge)
    expect(merged).toHaveLength(11)
    expect(merged.every((c) => c.capabilityPhaseLabel === 'Onboarding via invite')).toBe(true)
  })

  it('reports the two truncated F-050 / F-051 links as unmatched', () => {
    expect(result.conflicts.unmatched).toEqual([
      { pwcFeatureId: 'F-050', text: 'Review & publish vacancies', actor: 'staff', ref: 947 },
      { pwcFeatureId: 'F-051', text: 'Review & publish vacancies', actor: 'staff', ref: 947 },
    ])
  })

  it('never merges the unmatched link onto the table\'s longer row', () => {
    // The table's nearest row is a superset of this text. A prefix match
    // would silently absorb it.
    const longer = result.capabilities.find(
      (c) => c.ref === 947 && c.text.length > 'Review & publish vacancies'.length,
    )
    expect(longer?.releaseId).not.toBeNull()
    const exact = result.capabilities.find(
      (c) => c.ref === 947 && c.text === 'Review & publish vacancies',
    )
    expect(exact?.releaseId).toBeNull()
  })

  it('sees the single 1.1 → 1.4 conflict on F-014 electronic T&Cs', () => {
    const one = result.conflicts.release.filter(
      (c) => c.featureReleaseId === '1.1' && c.capabilityReleaseId === '1.4',
    )
    expect(one).toHaveLength(1)
    expect(one[0]).toMatchObject({ pwcFeatureId: 'F-014', ref: 951 })
    expect(one[0].capabilityText).toBe('Electronic T&Cs acceptance')
  })

  it('has no duplicate PwC feature ids', () => {
    const ids = result.features.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every feature exactly one release and one canonical phase', () => {
    const phaseIds = new Set(result.phases.map((p) => p.id))
    for (const feature of result.features) {
      expect(feature.releaseId).toBeTruthy()
      expect(phaseIds.has(feature.phaseId)).toBe(true)
    }
  })

  /**
   * PRD §6 quotes "employer 46, staff 24, system 22, jobseeker 15". That is the
   * distribution of the table's 107 *raw entries*. It sums to 107, the same as
   * the merged distinct capability count, but it is a different set — so all
   * three are pinned here to keep the distinction from being lost.
   */
  it('distributes actors across the raw table entries as PRD §6 quotes', () => {
    const sequencing = parseSequencingTable(fs.readFileSync(SEQUENCING_PATH, 'utf8'))
    const counts: Record<string, number> = {}
    for (const c of sequencing.capabilities) counts[c.actor] = (counts[c.actor] ?? 0) + 1

    expect(sequencing.capabilities).toHaveLength(107)
    expect(counts).toEqual({ employer: 46, staff: 24, system: 22, jobseeker: 15 })
  })

  it('drops one employer entry when the case-variant pair collapses', () => {
    const counts: Record<string, number> = {}
    for (const c of result.capabilities) {
      if (c.source === 'mapping') continue // not placed by the table
      counts[c.actor] = (counts[c.actor] ?? 0) + 1
    }
    // 106 table-distinct: both casings of "Filter and sort applications"
    // (employer, 980) are one capability.
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(106)
    expect(counts).toEqual({ employer: 45, staff: 24, system: 22, jobseeker: 15 })
  })

  it('adds the mapping-only staff capability back to reach 107 merged', () => {
    const counts: Record<string, number> = {}
    for (const c of result.capabilities) counts[c.actor] = (counts[c.actor] ?? 0) + 1

    expect(result.capabilities).toHaveLength(107)
    expect(counts).toEqual({ employer: 45, staff: 25, system: 22, jobseeker: 15 })
  })
})

describe('the real documents still fail loudly when corrupted (R-11.2)', () => {
  it('names the line number when a real mapping line is corrupted', () => {
    const lines = fs.readFileSync(MAPPING_PATH, 'utf8').split('\n')
    // Line 21 is a capability bullet; strip its "(actor, ref)".
    const target = lines.findIndex((l) => /^\s+\* • .+\(staff, 938\)\s*$/.test(l))
    expect(target).toBeGreaterThan(-1)
    lines[target] = '  * • Manual contacts & relationships creation'

    const corrupted = lines.join('\n')
    expect(() => parseMappingDocument(corrupted)).toThrow(ParseError)
    expect(() => parseMappingDocument(corrupted)).toThrow(
      new RegExp(`:${target + 1} —`),
    )
  })

  it('names the line number when a real table cell is corrupted', () => {
    const lines = fs.readFileSync(SEQUENCING_PATH, 'utf8').split('\n')
    lines[2] = lines[2].replace('(staff, 938)', '')

    const corrupted = lines.join('\n')
    expect(() => parseSequencingTable(corrupted)).toThrow(ParseError)
    expect(() => parseSequencingTable(corrupted)).toThrow(/:3 —/)
  })

  it('fails when a phase column is renamed in the real table', () => {
    const md = fs
      .readFileSync(SEQUENCING_PATH, 'utf8')
      .replace('Manage Vacancies', 'Vacancy Management')
    expect(() => parseSequencingTable(md)).toThrow(/Unrecognised phase label/)
  })

  it('reports drift rather than passing silently when a feature is removed', () => {
    const md = fs.readFileSync(MAPPING_PATH, 'utf8')
    const withoutOne = md.replace(
      /#### 🔹 PWC Feature: Invite employer \(F-002\)[\s\S]*?(?=\n#### |\n### |\n---)/,
      '',
    )
    const mapping = parseMappingDocument(withoutOne)
    const sequencing = parseSequencingTable(fs.readFileSync(SEQUENCING_PATH, 'utf8'))
    const drift = findCountDrift(reconcile(mapping, sequencing))

    expect(drift.length).toBeGreaterThan(0)
    expect(drift.some((d) => d.key === 'pwcFeatures' && d.actual === 47)).toBe(true)
  })
})
