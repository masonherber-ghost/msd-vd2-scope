import { describe, expect, it } from 'vitest'
import { buildCoverage, findNearDuplicates } from '@/lib/scope-coverage'
import { makeScopeGraph } from '@/test/scope-fixture'

const graph = makeScopeGraph({
  featureMvpLinks: [
    { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping' },
    { pwc_feature_id: 'F-001', mvp_feature_id: 2, source: 'mapping' },
    { pwc_feature_id: 'F-002', mvp_feature_id: 3, source: 'mapping' },
  ],
})
const model = buildCoverage(graph)

describe('buildCoverage — ranking (R-8.20)', () => {
  it('ranks by how many features cite a ref, most first', () => {
    expect(model.ranking.map((r) => [r.ref, r.featureIds.length])).toEqual([
      [938, 1],
      [948, 1],
    ])
  })

  it('counts a ref once per feature, not once per record', () => {
    // F-001 links to both records of ref 938; that is one citing feature.
    expect(model.ranking.find((r) => r.ref === 938)?.featureIds).toEqual(['F-001'])
  })

  it('carries the capability count alongside', () => {
    expect(model.ranking.find((r) => r.ref === 938)?.capabilityCount).toBe(2)
  })
})

describe('buildCoverage — cross-release refs (R-8.21)', () => {
  it('finds none when every citing feature ships together', () => {
    expect(model.crossRelease).toEqual([])
  })

  it('flags a ref cited from two releases', () => {
    const spanning = buildCoverage(
      makeScopeGraph({
        pwcFeatures: graph.pwcFeatures.map((f) =>
          f.id === 'F-002' ? { ...f, release_id: '1.4' } : f,
        ),
        featureMvpLinks: [
          { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping' },
          { pwc_feature_id: 'F-002', mvp_feature_id: 2, source: 'mapping' },
        ],
      }),
    )
    expect(spanning.crossRelease).toHaveLength(1)
    expect(spanning.crossRelease[0]).toMatchObject({
      ref: 938,
      releaseIds: ['1.1', '1.4'],
    })
  })
})

describe('buildCoverage — orphans in both directions (R-8.22)', () => {
  it('finds an MVP ref with no capabilities', () => {
    const orphaned = buildCoverage(
      makeScopeGraph({
        mvpFeatures: [
          ...graph.mvpFeatures,
          { id: 9, ref: 937, scope_option: null, title: 'Access recovery', source: 'mapping' },
        ],
      }),
    )
    expect(
      orphaned.orphans.mvpWithoutCapabilities.map((o) => o.label),
    ).toContain('937')
  })

  it('finds an MVP ref no feature cites', () => {
    const tableOnly = buildCoverage(
      makeScopeGraph({
        mvpFeatures: [
          ...graph.mvpFeatures,
          { id: 9, ref: 950, scope_option: null, title: 'Audit histories', source: 'sequencing' },
        ],
        featureMvpLinks: [],
      }),
    )
    expect(tableOnly.orphans.mvpWithoutFeature.map((o) => o.label)).toContain('950')
  })

  it('finds a feature with no capabilities, quoting the source qualifier', () => {
    const noCaps = buildCoverage(
      makeScopeGraph({
        pwcFeatures: [
          {
            id: 'F-008',
            name: 'Account access recovery',
            foundational_build: '',
            release_id: '1.1',
            phase_id: 'access-and-onboarding',
            source_phase_label: null,
            capability_note: 'Mapped under Release 2+ in table',
            display_order: 1,
            source: 'mapping',
          },
        ],
        featureCapabilityLinks: [],
        featureMvpLinks: [],
      }),
    )
    expect(noCaps.orphans.featuresWithoutCapabilities).toEqual([
      { id: 'F-008', label: 'F-008', detail: 'Mapped under Release 2+ in table' },
    ])
  })

  it('reports each ref once even when it has several records', () => {
    // 938 has two records in the fixture.
    const refs = model.orphans.mvpWithoutFeature.map((o) => o.label)
    expect(new Set(refs).size).toBe(refs.length)
  })
})

describe('buildCoverage — counts (R-8.23, R-8.24)', () => {
  it('counts features and capabilities per release', () => {
    const release11 = model.perRelease.find((r) => r.releaseId === '1.1')!
    expect(release11).toMatchObject({ features: 2, capabilities: 2 })
  })

  it('breaks capabilities down by actor', () => {
    const release11 = model.perRelease.find((r) => r.releaseId === '1.1')!
    expect(release11.actors).toEqual([
      { actor: 'employer', count: 1 },
      { actor: 'staff', count: 1 },
    ])
  })

  it('lists a release with no features but capabilities', () => {
    const release14 = model.perRelease.find((r) => r.releaseId === '1.4')!
    expect(release14).toMatchObject({ features: 0, capabilities: 1 })
  })

  it('produces one cell per phase × release', () => {
    expect(model.perCell).toHaveLength(4)
  })

  it('cell totals agree with the release totals', () => {
    const cellFeatures = model.perCell.reduce((n, c) => n + c.features, 0)
    const releaseFeatures = model.perRelease.reduce((n, r) => n + r.features, 0)
    expect(cellFeatures).toBe(releaseFeatures)
  })
})

describe('findNearDuplicates (D-4)', () => {
  it('finds a truncation, where one contains the other', () => {
    const found = findNearDuplicates([
      { mvp_ref: 947, text: 'Review & publish vacancies' },
      {
        mvp_ref: 947,
        text: 'Review & publish vacancies. Staff can also request specific corrections',
      },
    ])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ ref: 947, reason: 'prefix', similarity: 1 })
  })

  it('finds a rewording, where neither contains the other', () => {
    const found = findNearDuplicates([
      { mvp_ref: 956, text: 'Download the existing JSP-generated CV in an editable format' },
      { mvp_ref: 956, text: 'Download the JSP generated CV in editable format' },
    ])
    expect(found).toHaveLength(1)
    expect(found[0].reason).toBe('wording')
    expect(found[0].similarity).toBeGreaterThanOrEqual(0.6)
  })

  it('ignores hyphenation and case when comparing words', () => {
    const found = findNearDuplicates([
      { mvp_ref: 1, text: 'JSP-generated CV download' },
      { mvp_ref: 1, text: 'jsp generated cv download' },
    ])
    expect(found).toHaveLength(1)
  })

  it('never pairs capabilities under different refs', () => {
    expect(
      findNearDuplicates([
        { mvp_ref: 1, text: 'View authenticated landing page' },
        { mvp_ref: 2, text: 'View authenticated landing page' },
      ]),
    ).toEqual([])
  })

  it('leaves genuinely different capabilities alone', () => {
    expect(
      findNearDuplicates([
        { mvp_ref: 1, text: 'Upload personal CV' },
        { mvp_ref: 1, text: 'Scanning uploaded files for malware' },
      ]),
    ).toEqual([])
  })

  it('flags rather than merges — both texts survive', () => {
    const found = findNearDuplicates([
      { mvp_ref: 941, text: 'View authenticated landing page' },
      { mvp_ref: 941, text: 'View authenticated landing page / dashboard' },
    ])
    expect(found[0].a).toBeTruthy()
    expect(found[0].b).toBeTruthy()
    expect(found[0].a).not.toBe(found[0].b)
  })
})
