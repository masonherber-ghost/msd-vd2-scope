import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseMappingDocument } from './mapping-parser.js'
import { parseSequencingTable } from './sequencing-parser.js'
import { reconcile } from './reconcile.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (name: string) =>
  fs.readFileSync(path.join(here, '__fixtures__', name), 'utf8')

const mapping = parseMappingDocument(read('mapping-hazards.md'))
const sequencing = parseSequencingTable(read('sequencing-hazards.md'))
const result = reconcile(mapping, sequencing)

describe('reconcile — releases are the union of both sources', () => {
  it('keeps releases from either source, ordered by version', () => {
    expect(result.releases.map((r) => r.id)).toEqual(['1.1', '1.2', '1.4', '1.9', '2'])
  })

  it('records which source each release came from', () => {
    const byId = new Map(result.releases.map((r) => [r.id, r]))
    expect(byId.get('1.1')).toMatchObject({
      inMappingSource: true,
      inSequencingSource: true,
    })
    // 1.9 is a mapping-file construct, not a sequenced release.
    expect(byId.get('1.9')).toMatchObject({
      inMappingSource: true,
      inSequencingSource: false,
    })
    expect(byId.get('2')).toMatchObject({
      inMappingSource: false,
      inSequencingSource: true,
    })
  })
})

describe('reconcile — capabilities', () => {
  it('deduplicates case-variant text, keeping first-seen casing', () => {
    const ref980 = result.capabilities.filter((c) => c.ref === 980)
    expect(ref980).toHaveLength(1)
    expect(ref980[0].text).toBe('Filter and Sort Applications')
  })

  it('does NOT merge near-duplicate text', () => {
    const ref941 = result.capabilities.filter((c) => c.ref === 941)
    expect(ref941.map((c) => c.text).sort()).toEqual([
      'View authenticated landing page',
      'View authenticated landing page / dashboard',
    ])
  })

  it('takes release and phase from the sequencing table', () => {
    const tcs = result.capabilities.find((c) => c.ref === 951)
    expect(tcs).toMatchObject({ releaseId: '1.4', phaseId: 'access-and-onboarding' })
  })

  it('keeps a mapping-only capability, with no placement', () => {
    const unplaced = result.capabilities.find((c) => c.ref === 947)
    expect(unplaced).toMatchObject({ releaseId: null, phaseId: null, source: 'mapping' })
  })
})

describe('reconcile — MVP features', () => {
  it('keys records on (ref, scope_option)', () => {
    const ref938 = result.mvpFeatures.filter((m) => m.ref === 938)
    expect(ref938.map((m) => m.scopeOption).sort()).toEqual(['1A', null])
  })

  it('does not add a bare record for a ref the mapping file already splits', () => {
    // 951 has 1A and 1B; the table also cites 951. A third bare record here
    // would be spurious.
    const ref951 = result.mvpFeatures.filter((m) => m.ref === 951)
    expect(ref951.map((m) => m.scopeOption).sort()).toEqual(['1A', '1B'])
  })

  it('counts records and refs separately', () => {
    // 8 records from the mapping file's MVP lines, plus one for ref 947,
    // which this fixture cites only as a capability.
    expect(result.summary.mvpRecords).toBe(9)
    expect(result.summary.mvpRefs).toBe(7)
  })

  it('attributes a record inferred from a capability to that capability\'s source', () => {
    const ref947 = result.mvpFeatures.filter((m) => m.ref === 947)
    expect(ref947).toEqual([
      { ref: 947, scopeOption: null, title: 'MVP feature 947', source: 'mapping' },
    ])
  })

  it('adds one bare record for a ref only the table knows', () => {
    const withExtra = reconcile(
      mapping,
      parseSequencingTable(
        [
          '| Release | Onboarding via invite | Access & Onboarding | Applications & Referrals | Outcomes & Support |',
          '| --- | --- | --- | --- | --- |',
          '| **Release 1.1** | • A table-only capability (system, 999) | - | - | - |',
        ].join('\n'),
      ),
    )
    const ref999 = withExtra.mvpFeatures.filter((m) => m.ref === 999)
    expect(ref999).toEqual([
      { ref: 999, scopeOption: null, title: 'MVP feature 999', source: 'sequencing' },
    ])
  })
})

describe('reconcile — conflicts are data, not errors (R-7.1)', () => {
  it('records a release conflict without discarding either placement', () => {
    const conflict = result.conflicts.release.find((c) => c.pwcFeatureId === 'F-014')
    expect(conflict).toMatchObject({
      featureReleaseId: '1.1',
      capabilityReleaseId: '1.4',
      ref: 951,
    })
    // Both sides survive: the capability keeps its table placement.
    expect(result.capabilities.find((c) => c.ref === 951)?.releaseId).toBe('1.4')
  })

  it('counts release conflicts and breaks them down by pair', () => {
    expect(result.summary.releaseConflicts).toBe(5)
    expect(result.summary.releaseConflictBreakdown).toEqual([
      { from: '1.1', to: '1.2', links: 2 },
      { from: '1.1', to: '2', links: 2 },
      { from: '1.1', to: '1.4', links: 1 },
    ])
  })

  it('flags a phase conflict the canonical merge resolves', () => {
    const merged = result.conflicts.phase.filter((c) => c.resolvedByCanonicalMerge)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      pwcFeatureId: 'F-014',
      featurePhaseLabel: 'Access & onboarding',
      capabilityPhaseLabel: 'Onboarding via invite',
    })
  })

  it('separates phase conflicts needing review from those the merge resolves', () => {
    expect(result.summary.phaseConflicts).toBe(3)
    expect(result.summary.phaseConflictsAfterMerge).toBe(2)
  })

  it('records an unmatched link rather than merging on a prefix', () => {
    expect(result.conflicts.unmatched).toEqual([
      { pwcFeatureId: 'F-001', text: 'Review & publish vacancies', actor: 'staff', ref: 947 },
    ])
  })

  it('records every citation of an unmatched capability, not just the first', () => {
    // Two features citing the same missing text must both be reported —
    // otherwise the first one's placeholder silently satisfies the second.
    const twice = parseMappingDocument(
      read('mapping-hazards.md').replace('#### 🔹 PWC Feature: Invite employer (F-001)', '#### 🔹 PWC Feature: Invite employer (F-001)').concat(`
### 📂 Phase: Manage Vacancies

#### 🔹 PWC Feature: Publish vacancies (F-051)
* **Included in foundational build:** Publishing.
* **Assumptions:**
  * Assumes review.
* **MVP Feature Mapping:**
  * \`947 - Staff can review and publish vacancies\`
* **Sequenced Release Capabilities (\`x\`):**
  * • Review & publish vacancies (staff, 947)
`),
    )
    const both = reconcile(twice, sequencing)
    expect(both.conflicts.unmatched.map((u) => u.pwcFeatureId)).toEqual(['F-001', 'F-051'])
  })
})

describe('reconcile — link counts', () => {
  it('preserves every link from the mapping file', () => {
    expect(result.summary.featureMvpLinks).toBe(8)
    expect(result.summary.featureCapabilityLinks).toBe(7)
  })

  it('marks each capability link matched or unmatched', () => {
    const unmatched = result.featureCapabilityLinks.filter((l) => !l.matched)
    expect(unmatched).toHaveLength(1)
  })

  it('flattens assumptions with their owning feature', () => {
    expect(result.summary.assumptions).toBe(7)
    expect(result.assumptions.filter((a) => a.pwcFeatureId === 'F-001')).toHaveLength(2)
  })
})

describe('reconcile — canonical phases', () => {
  it('always exposes the 7 canonical phases in diagram order', () => {
    expect(result.phases.map((p) => p.displayOrder)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(result.phases[0].name).toBe('Access & Onboarding')
    expect(result.phases[6].name).toBe('Outcomes & Support')
  })

  it('stores the duplicated epic ref 186 faithfully (D-2)', () => {
    const withRef186 = result.phases.filter((p) => p.epicRef === '186')
    expect(withRef186.map((p) => p.name)).toEqual([
      'Applications & Referrals',
      'Employer Recruitment',
    ])
  })
})
