import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMappingDocument } from './mapping-parser.js'
import { parseSequencingTable } from './sequencing-parser.js'
import { reconcile } from './reconcile.js'
import { ParseError } from './scope-types.js'
import {
  EXPECTED_COUNTS,
  EXPECTED_RELEASE_CONFLICTS,
  EXPECTED_SOURCE_COUNTS,
  EXPECTED_SOURCE_RELEASE_CONFLICTS,
  MAPPING_PATH,
  SEQUENCING_PATH,
  findCountDrift,
  loadScopeFromSources,
  loadScopeFromSourcesRaw,
} from './scope-source.js'

const result = loadScopeFromSources()
const raw = loadScopeFromSourcesRaw()

/**
 * The raw figures are asserted separately from the post-override ones so a
 * declared override can never mask a real change to a source document.
 */
describe('the documents as written still reconcile to the PRD figures', () => {
  it('has no drift from PRD §6 with no overrides applied', () => {
    expect(findCountDrift(raw, EXPECTED_SOURCE_COUNTS)).toEqual([])
  })

  it.each(Object.entries(EXPECTED_SOURCE_COUNTS))('raw %s is %i', (key, expected) => {
    expect(raw.summary[key as keyof typeof EXPECTED_SOURCE_COUNTS]).toBe(expected)
  })

  it('breaks raw release conflicts down exactly as PRD §7 does', () => {
    expect(raw.summary.releaseConflictBreakdown).toEqual([
      ...EXPECTED_SOURCE_RELEASE_CONFLICTS,
    ])
  })
})

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

  it('applies OV-003, merging release 1.9 into the table\u2019s 1.4', () => {
    expect(result.appliedAliases).toHaveLength(1)
    const [applied] = result.appliedAliases
    expect(applied.alias).toMatchObject({ id: 'OV-003', from: '1.9', to: '1.4' })
    expect(applied.features).toHaveLength(15)
  })

  it('leaves no trace of 1.9 in the reconciled model', () => {
    expect(result.releases.map((r) => r.id)).toEqual(['1.1', '1.2', '1.3', '1.4', '2'])
    expect(result.features.some((f) => f.releaseId === '1.9')).toBe(false)
    expect(result.capabilities.some((c) => c.releaseId === '1.9')).toBe(false)
    for (const entry of result.summary.releaseConflictBreakdown) {
      expect([entry.from, entry.to]).not.toContain('1.9')
    }
  })

  it('makes 1.4 a release both documents name, carrying the 1.9 prose', () => {
    const merged = result.releases.find((r) => r.id === '1.4')!
    expect(merged).toMatchObject({
      label: 'Release 1.4',
      name: 'General Availability & Scale-Up',
      inMappingSource: true,
      inSequencingSource: true,
    })
  })

  it('clears the five 1.9 \u2192 1.4 conflicts without touching the others', () => {
    // The merge is the only reason the raw 35 drops past the split's 34.
    const raw = new Map(
      EXPECTED_SOURCE_RELEASE_CONFLICTS.map((e) => [`${e.from}->${e.to}`, e.links]),
    )
    expect(raw.get('1.9->1.4')).toBe(5)
    expect(
      result.summary.releaseConflictBreakdown.some(
        (e) => e.from === '1.4' && e.to === '1.4',
      ),
    ).toBe(false)
    // The other two 1.9 rows survive intact, renamed to 1.4.
    const after = new Map(
      result.summary.releaseConflictBreakdown.map((e) => [`${e.from}->${e.to}`, e.links]),
    )
    expect(after.get('1.4->2')).toBe(raw.get('1.9->2'))
    expect(after.get('1.4->1.1')).toBe(raw.get('1.9->1.1'))
  })

  it('applies OV-002, splitting F-085 into F-085 and F-093', () => {
    expect(result.appliedSplits).toHaveLength(1)
    const [applied] = result.appliedSplits
    expect(applied.split.id).toBe('OV-002')
    expect(applied.from).toMatchObject({
      featureId: 'F-085',
      name: 'Record recruitment outcome',
      releaseId: '1.3',
      sourcePhaseLabel: 'Outcomes & Support',
    })
    expect(applied.into).toEqual([
      { featureId: 'F-085', releaseId: '1.2', phaseId: 'manage-vacancies', capabilities: 1 },
      {
        featureId: 'F-093',
        releaseId: '1.3',
        phaseId: 'employer-recruitment',
        capabilities: 2,
      },
    ])
  })

  it('places each half where the sequencing table already put its capabilities', () => {
    const a = result.features.find((f) => f.id === 'F-085')!
    const b = result.features.find((f) => f.id === 'F-093')!

    expect(a).toMatchObject({
      name: 'Record vacancy outcome',
      releaseId: '1.2',
      phaseId: 'manage-vacancies',
    })
    expect(b).toMatchObject({
      name: 'Record applicant progression outcome',
      releaseId: '1.3',
      phaseId: 'employer-recruitment',
    })
  })

  it('clears every conflict the undivided feature carried', () => {
    for (const id of ['F-085', 'F-093']) {
      expect(result.conflicts.release.filter((c) => c.pwcFeatureId === id)).toEqual([])
      expect(result.conflicts.phase.filter((c) => c.pwcFeatureId === id)).toEqual([])
    }
  })

  it('redistributes links without adding or dropping any', () => {
    // A split moves scope between features; it never creates or loses it.
    expect(result.summary.featureMvpLinks).toBe(raw.summary.featureMvpLinks)
    expect(result.summary.featureCapabilityLinks).toBe(raw.summary.featureCapabilityLinks)
    expect(result.summary.assumptions).toBe(raw.summary.assumptions)
    expect(result.summary.pwcFeatures).toBe(raw.summary.pwcFeatures + 1)
  })

  it('divides assumptions and renumbers each half from 1', () => {
    const a = result.features.find((f) => f.id === 'F-085')!
    const b = result.features.find((f) => f.id === 'F-093')!
    expect(a.assumptions.map((x) => x.position)).toEqual([1])
    expect(b.assumptions.map((x) => x.position)).toEqual([1, 2])
    expect(a.assumptions[0].text).toMatch(/vacancy outcome process/i)
    expect(b.assumptions[0].text).toMatch(/application outcome process/i)
  })

  it('keeps display_order contiguous after the insertion', () => {
    const orders = result.features.map((f) => f.displayOrder)
    expect(orders).toEqual(Array.from({ length: orders.length }, (_, i) => i + 1))
  })

  it('sees the single 1.1 → 1.4 conflict on F-014 electronic T&Cs', () => {
    const one = result.conflicts.release.filter(
      (c) => c.featureReleaseId === '1.1' && c.capabilityReleaseId === '1.4',
    )
    expect(one).toHaveLength(1)
    expect(one[0]).toMatchObject({ pwcFeatureId: 'F-014', ref: 951 })
    expect(one[0].capabilityText).toBe('Electronic T&Cs acceptance')
  })

  /**
   * The Phase 4 filter gate asserts these. Locked here so a source change or
   * a new override cannot move them silently.
   */
  it('distributes features across releases as the filter gate expects', () => {
    const byRelease = new Map<string, number>()
    for (const feature of result.features) {
      byRelease.set(feature.releaseId, (byRelease.get(feature.releaseId) ?? 0) + 1)
    }
    expect(Object.fromEntries(byRelease)).toEqual({
      '1.1': 20,
      // 9, not the pre-split 8: OV-002 puts F-085 in 1.2.
      '1.2': 9,
      '1.3': 5,
      // Was 1.9 until OV-003 declared it and the table's 1.4 to be one release.
      '1.4': 15,
    })
  })

  it('has exactly four features citing MVP ref 947', () => {
    const citing = result.features
      .filter((f) => f.mvpFeatures.some((m) => m.ref === 947))
      .map((f) => f.id)
    expect(citing).toEqual(['F-039', 'F-045', 'F-050', 'F-051'])
  })

  it('has three features carrying an Option 1B record, not two', () => {
    // PRD §11 lists the option suffix on refs 938, 946 and 951 but omits 948,
    // which F-011 cites as "(Option 1B)".
    const withOption1B = result.features
      .filter((f) => f.mvpFeatures.some((m) => m.scopeOption === '1B'))
      .map((f) => f.id)
    expect(withOption1B).toEqual(['F-009', 'F-010', 'F-011'])

    const refs = result.mvpFeatures
      .filter((m) => m.scopeOption === '1B')
      .map((m) => m.ref)
      .sort((a, b) => a - b)
    expect(refs).toEqual([948, 951])
  })

  it('has no release 1.1 feature citing a jobseeker capability', () => {
    const capabilityByKey = new Map(result.capabilities.map((c) => [c.key, c]))
    const jobseekerIn11 = result.features
      .filter((f) => f.releaseId === '1.1')
      .filter((f) =>
        f.capabilities.some(
          (c) =>
            capabilityByKey.get(`${c.text.toLowerCase()}|${c.ref}`)?.actor === 'jobseeker',
        ),
      )
    expect(jobseekerIn11).toEqual([])
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
